import CoreBluetooth
import ExpoModulesCore
import Foundation
import MultipeerConnectivity
import NearbyInteraction

// Franky Tap en iOS, dos radios a la vez:
//   · Multipeer + Nearby Interaction (banda ultraancha): distancia en
//     centímetros entre iPhone con chip U1/U2. Dispara "onTap" a ≤ 30 cm.
//   · Bluetooth de baja energía (CoreBluetooth): el mismo servicio y la misma
//     característica que el módulo de Android, así que un iPhone detecta a un
//     Android (y viceversa) y un iPhone sin banda ultraancha detecta a otro.
//     Dispara "onTap" cuando la señal es fuerte (móviles pegados).
// Por el aire solo viaja el testigo aleatorio del servidor. Todo en primer
// plano; al salir de la pantalla se apaga todo.
private let service = "franky-tap"
// Debe coincidir con SERVICIO / TOKEN_CHARACTERISTIC del módulo de Android.
private let bleService = CBUUID(string: "7f2a9c10-4b6d-4f3e-9a51-f1a0c7d3e880")
private let bleCharacteristic = CBUUID(string: "7f2a9c11-4b6d-4f3e-9a51-f1a0c7d3e880")
private let rssiThreshold = -52
private let rssiSamplesNeeded = 2
private let rssiWindow: TimeInterval = 2.5
private let tapSilence: TimeInterval = 5
private struct Hello: Codable { let v: Int; let token: String; let ni: String? }

public class FrankyTapModule: Module {
  private let manager = TapManager()
  public func definition() -> ModuleDefinition {
    Name("FrankyTap")
    Events("onSighting", "onTap", "onError")
    AsyncFunction("isAvailable") { TapManager.capability() }.runOnQueue(.main)
    AsyncFunction("requestPermissions") { (promise: Promise) in
      self.manager.requestPermissions { promise.resolve($0) }
    }.runOnQueue(.main)
    AsyncFunction("start") { (token: String) in
      self.manager.emit = { [weak self] name, body in self?.sendEvent(name, body) }
      try self.manager.start(token)
    }.runOnQueue(.main)
    AsyncFunction("stop") { self.manager.stop() }.runOnQueue(.main)
    OnDestroy { DispatchQueue.main.async { self.manager.stop() } }
  }
}

// Todo el estado vive en el hilo principal. Los delegados de Multipeer pueden
// llegar por otras colas y se reenvían; los de CoreBluetooth se crean ya en
// la cola principal. Las comprobaciones de identidad evitan que un callback
// tardío de una sesión antigua altere la nueva.
private final class TapManager: NSObject {
  var emit: ((String, [String: Any]) -> Void)?
  private var token: String?
  private var tokenData: Data?

  // Multipeer + banda ultraancha
  private var identity: MCPeerID?
  private var connection: MCSession?
  private var advertiser: MCNearbyServiceAdvertiser?
  private var browser: MCNearbyServiceBrowser?
  private var ranging: [MCPeerID: NISession] = [:]
  private var configurations: [MCPeerID: NINearbyPeerConfiguration] = [:]
  private var peers: [MCPeerID: String] = [:]
  private var helloSent = Set<MCPeerID>()
  private var inviting = Set<MCPeerID>()
  private var closeSamples: [MCPeerID: [Date]] = [:]
  private var lastTap: [MCPeerID: Date] = [:]

  // Bluetooth de baja energía
  private var central: CBCentralManager?
  private var peripheral: CBPeripheralManager?
  private var bleWanted = false
  private var blePeripherals: [UUID: CBPeripheral] = [:]
  private var bleTokens: [UUID: (token: String, seen: Date)] = [:]
  private var bleConnecting = Set<UUID>()
  private var bleSamples: [String: [Date]] = [:]
  private var bleLastTap: [String: Date] = [:]
  private var permissionCallbacks: [([String: Any]) -> Void] = []

  static func precise() -> Bool {
    if #available(iOS 16.0, *) { return NISession.deviceCapabilities.supportsPreciseDistanceMeasurement }
    return NISession.isSupported
  }
  static func capability() -> [String: Any] {
    let precise = Self.precise()
    switch CBManager.authorization {
    case .denied, .restricted:
      // Sin Bluetooth solo queda la banda ultraancha entre iPhone compatibles.
      return ["available": precise, "precise": precise, "reason": precise ? "ok" : "no_permission"]
    default:
      return ["available": true, "precise": precise, "reason": "ok"]
    }
  }

  /// Crear el gestor central hace que iOS pregunte por el Bluetooth la primera
  /// vez. Se resuelve cuando el sistema informa del estado (o al segundo y
  /// medio si no lo hace), con la capacidad ya resuelta.
  func requestPermissions(_ done: @escaping ([String: Any]) -> Void) {
    if central == nil { central = CBCentralManager(delegate: self, queue: .main, options: [CBCentralManagerOptionShowPowerAlertKey: false]) }
    if let central, central.state != .unknown && central.state != .resetting {
      done(Self.capability()); return
    }
    permissionCallbacks.append(done)
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in self?.flushPermissionCallbacks() }
  }
  private func flushPermissionCallbacks() {
    let pending = permissionCallbacks; permissionCallbacks.removeAll()
    let result = Self.capability()
    pending.forEach { $0(result) }
  }

  func start(_ value: String) throws {
    guard let uuid = UUID(uuidString: value) else { throw NSError(domain: "FrankyTap", code: 1) }
    stop(); token = value
    var raw = uuid.uuid
    tokenData = withUnsafeBytes(of: &raw) { Data($0) }
    startMultipeer()
    startBluetooth()
  }
  func stop() {
    token = nil; tokenData = nil
    stopMultipeer()
    stopBluetooth()
  }

  private func fail(_ code: String, _ error: Error? = nil) {
    emit?("onError", ["code": code, "message": error?.localizedDescription ?? code])
  }

  // MARK: - Multipeer + Nearby Interaction

  private func startMultipeer() {
    let peer = MCPeerID(displayName: "fk-" + String(UUID().uuidString.prefix(8)))
    identity = peer
    let session = MCSession(peer: peer, securityIdentity: nil, encryptionPreference: .required)
    connection = session; session.delegate = self
    // Nada identificable en el anuncio público: el testigo viaja cifrado.
    let ad = MCNearbyServiceAdvertiser(peer: peer, discoveryInfo: nil, serviceType: service)
    advertiser = ad; ad.delegate = self; ad.startAdvertisingPeer()
    let scan = MCNearbyServiceBrowser(peer: peer, serviceType: service)
    browser = scan; scan.delegate = self; scan.startBrowsingForPeers()
  }
  private func stopMultipeer() {
    let old = connection; connection = nil
    advertiser?.stopAdvertisingPeer(); advertiser = nil
    browser?.stopBrowsingForPeers(); browser = nil
    old?.disconnect(); identity = nil
    let oldRanging = Array(ranging.values); ranging.removeAll()
    oldRanging.forEach { $0.invalidate() }
    configurations.removeAll(); peers.removeAll(); helloSent.removeAll()
    inviting.removeAll(); closeSamples.removeAll(); lastTap.removeAll()
  }
  private func remove(_ peer: MCPeerID) {
    let ni = ranging.removeValue(forKey: peer); ni?.invalidate()
    configurations.removeValue(forKey: peer); peers.removeValue(forKey: peer)
    helloSent.remove(peer); inviting.remove(peer)
    closeSamples.removeValue(forKey: peer); lastTap.removeValue(forKey: peer)
  }
  private func ensureRanging(_ peer: MCPeerID) -> NISession? {
    if let existing = ranging[peer] { return existing }
    guard Self.precise() else { return nil }
    let ni = NISession(); ni.delegate = self; ni.delegateQueue = .main
    ranging[peer] = ni
    return ni
  }
  private func sendHello(_ peer: MCPeerID) {
    guard let connection, let token, !helloSent.contains(peer) else { return }
    do {
      let discovery = ensureRanging(peer)?.discoveryToken
      let archive = try discovery.map { try NSKeyedArchiver.archivedData(withRootObject: $0, requiringSecureCoding: true).base64EncodedString() }
      let data = try JSONEncoder().encode(Hello(v: 2, token: token, ni: archive))
      try connection.send(data, toPeers: [peer], with: .reliable)
      helloSent.insert(peer)
    } catch { fail("handshake_failed", error) }
  }
  private func receiveHello(_ data: Data, _ peer: MCPeerID) {
    guard data.count < 16384, let hello = try? JSONDecoder().decode(Hello.self, from: data),
      hello.v == 2, UUID(uuidString: hello.token) != nil, hello.token != token else {
      fail("peer_version"); return
    }
    peers[peer] = hello.token
    let ni = ensureRanging(peer)
    sendHello(peer)
    // Visto por Multipeer: sin distancia. La pantalla ofrece confirmarlo con
    // un toque; si además hay banda ultraancha, el acercamiento salta solo.
    emit?("onSighting", ["token": hello.token, "distanceCm": NSNull(), "precise": false])
    guard let ni, let archive = hello.ni, let raw = Data(base64Encoded: archive) else { return }
    do {
      guard let discovery = try NSKeyedUnarchiver.unarchivedObject(ofClass: NIDiscoveryToken.self, from: raw) else { fail("handshake_failed"); return }
      let config = NINearbyPeerConfiguration(peerToken: discovery)
      configurations[peer] = config; ni.run(config)
    } catch { fail("handshake_failed", error) }
  }
  private func measure(_ peer: MCPeerID, _ metres: Float?) {
    guard let value = peers[peer] else { return }
    let cm = metres.map { Double($0) * 100 }
    emit?("onSighting", ["token": value, "distanceCm": cm.map { $0 as Any } ?? NSNull(), "precise": cm != nil])
    guard let cm, cm.isFinite, cm >= 0, cm <= 30 else { closeSamples[peer] = []; return }
    let now = Date()
    if let previous = lastTap[peer], now.timeIntervalSince(previous) < tapSilence { return }
    var samples = (closeSamples[peer] ?? []).filter { now.timeIntervalSince($0) < 1.5 }
    samples.append(now); closeSamples[peer] = samples
    guard samples.count >= 2 else { return }
    closeSamples[peer] = []; lastTap[peer] = now
    emit?("onTap", ["token": value, "distanceCm": cm, "precise": true])
  }

  // MARK: - Bluetooth de baja energía (compatible con Android)

  private func startBluetooth() {
    bleWanted = true
    if central == nil { central = CBCentralManager(delegate: self, queue: .main, options: [CBCentralManagerOptionShowPowerAlertKey: false]) }
    if peripheral == nil { peripheral = CBPeripheralManager(delegate: self, queue: .main, options: [CBPeripheralManagerOptionShowPowerAlertKey: false]) }
    if central?.state == .poweredOn { startScanning() }
    if peripheral?.state == .poweredOn { startAdvertising() }
  }
  private func stopBluetooth() {
    bleWanted = false
    if let central, central.state == .poweredOn { central.stopScan() }
    for p in blePeripherals.values { central?.cancelPeripheralConnection(p) }
    blePeripherals.removeAll(); bleTokens.removeAll(); bleConnecting.removeAll()
    bleSamples.removeAll(); bleLastTap.removeAll()
    if let peripheral, peripheral.state == .poweredOn {
      peripheral.stopAdvertising(); peripheral.removeAllServices()
    }
  }
  private func startScanning() {
    guard bleWanted, let central, central.state == .poweredOn else { return }
    central.scanForPeripherals(withServices: [bleService], options: [CBCentralManagerScanOptionAllowDuplicatesKey: true])
  }
  private func startAdvertising() {
    guard bleWanted, let peripheral, peripheral.state == .poweredOn, let tokenData else { return }
    peripheral.removeAllServices()
    let characteristic = CBMutableCharacteristic(type: bleCharacteristic, properties: [.read], value: tokenData, permissions: [.readable])
    let gatt = CBMutableService(type: bleService, primary: true)
    gatt.characteristics = [characteristic]
    peripheral.add(gatt)
  }
  private func bleConfirm(_ remote: String, rssi: Int) {
    let now = Date()
    if let previous = bleLastTap[remote], now.timeIntervalSince(previous) < tapSilence { return }
    var samples = (bleSamples[remote] ?? []).filter { now.timeIntervalSince($0) < rssiWindow }
    samples.append(now); bleSamples[remote] = samples
    guard samples.count >= rssiSamplesNeeded else { return }
    bleSamples[remote] = []; bleLastTap[remote] = now
    emit?("onTap", ["token": remote, "distanceCm": NSNull(), "precise": false, "rssi": rssi])
  }
  private func bleFinish(_ p: CBPeripheral) {
    bleConnecting.remove(p.identifier)
    central?.cancelPeripheralConnection(p)
  }
}

// MARK: Multipeer delegados
extension TapManager: MCNearbyServiceAdvertiserDelegate, MCNearbyServiceBrowserDelegate {
  func advertiser(_ source: MCNearbyServiceAdvertiser, didReceiveInvitationFromPeer peerID: MCPeerID,
                  withContext context: Data?, invitationHandler: @escaping (Bool, MCSession?) -> Void) {
    DispatchQueue.main.async {
      guard source === self.advertiser, let session = self.connection else { invitationHandler(false, nil); return }
      invitationHandler(true, session)
    }
  }
  func advertiser(_ source: MCNearbyServiceAdvertiser, didNotStartAdvertisingPeer error: Error) {
    DispatchQueue.main.async { if source === self.advertiser { self.fail("local_network_failed", error) } }
  }
  func browser(_ source: MCNearbyServiceBrowser, foundPeer peerID: MCPeerID, withDiscoveryInfo info: [String: String]?) {
    DispatchQueue.main.async {
      guard source === self.browser, let mine = self.identity, let session = self.connection,
        mine.displayName < peerID.displayName, !self.inviting.contains(peerID), !session.connectedPeers.contains(peerID) else { return }
      self.inviting.insert(peerID)
      source.invitePeer(peerID, to: session, withContext: nil, timeout: 12)
      DispatchQueue.main.asyncAfter(deadline: .now() + 13) {
        if source === self.browser { self.inviting.remove(peerID) }
      }
    }
  }
  func browser(_ source: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {
    DispatchQueue.main.async {
      guard source === self.browser, self.connection?.connectedPeers.contains(peerID) != true else { return }
      self.remove(peerID)
    }
  }
  func browser(_ source: MCNearbyServiceBrowser, didNotStartBrowsingForPeers error: Error) {
    DispatchQueue.main.async { if source === self.browser { self.fail("local_network_failed", error) } }
  }
}
extension TapManager: MCSessionDelegate {
  func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
    DispatchQueue.main.async {
      guard session === self.connection else { return }
      if state == .connected { self.inviting.remove(peerID); self.sendHello(peerID) }
      else if state == .notConnected { self.remove(peerID) }
    }
  }
  func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
    DispatchQueue.main.async { if session === self.connection { self.receiveHello(data, peerID) } }
  }
  func session(_ s: MCSession, didReceive: InputStream, withName: String, fromPeer: MCPeerID) {}
  func session(_ s: MCSession, didStartReceivingResourceWithName: String, fromPeer: MCPeerID, with: Progress) {}
  func session(_ s: MCSession, didFinishReceivingResourceWithName: String, fromPeer: MCPeerID, at: URL?, withError: Error?) {}
}
extension TapManager: NISessionDelegate {
  func session(_ session: NISession, didUpdate objects: [NINearbyObject]) {
    guard let peer = ranging.first(where: { $0.value === session })?.key else { return }
    for object in objects { measure(peer, object.distance) }
  }
  func session(_ session: NISession, didInvalidateWith error: Error) {
    guard let peer = ranging.first(where: { $0.value === session })?.key else { return }
    ranging.removeValue(forKey: peer); configurations.removeValue(forKey: peer); closeSamples[peer] = []
    fail("nearby_unavailable", error)
  }
  func sessionWasSuspended(_ session: NISession) {
    guard let peer = ranging.first(where: { $0.value === session })?.key else { return }
    closeSamples[peer] = []
    if let value = peers[peer] { emit?("onSighting", ["token": value, "distanceCm": NSNull(), "precise": false]) }
  }
  func sessionSuspensionEnded(_ session: NISession) {
    guard let peer = ranging.first(where: { $0.value === session })?.key, let config = configurations[peer] else { return }
    session.run(config)
  }
  func session(_ session: NISession, didRemove objects: [NINearbyObject], reason: NINearbyObject.RemovalReason) {
    guard let peer = ranging.first(where: { $0.value === session })?.key else { return }
    closeSamples[peer] = []
    if reason == .timeout, let config = configurations[peer], connection?.connectedPeers.contains(peer) == true { session.run(config) }
  }
}

// MARK: CoreBluetooth delegados
extension TapManager: CBCentralManagerDelegate, CBPeripheralDelegate {
  func centralManagerDidUpdateState(_ manager: CBCentralManager) {
    flushPermissionCallbacks()
    guard manager === central else { return }
    switch manager.state {
    case .poweredOn: startScanning()
    case .unauthorized: if bleWanted { fail("no_permission") }
    case .poweredOff: if bleWanted { fail("radio_off") }
    default: break
    }
  }
  func centralManager(_ manager: CBCentralManager, didDiscover p: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
    guard bleWanted, let ownToken = token else { return }
    let rssi = RSSI.intValue
    // 127 es "sin medida". Señales débiles se ignoran: solo importa quien está pegado.
    guard rssi != 127, rssi >= -70 else { return }
    if let known = bleTokens[p.identifier], Date().timeIntervalSince(known.seen) < 15 {
      guard known.token != ownToken else { return }
      emit?("onSighting", ["token": known.token, "distanceCm": NSNull(), "precise": false, "rssi": rssi])
      if rssi >= rssiThreshold { bleConfirm(known.token, rssi: rssi) }
      return
    }
    guard bleConnecting.count < 4, !bleConnecting.contains(p.identifier) else { return }
    bleConnecting.insert(p.identifier)
    blePeripherals[p.identifier] = p
    p.delegate = self
    manager.connect(p, options: nil)
    DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in
      guard let self, self.bleConnecting.contains(p.identifier) else { return }
      self.bleFinish(p)
    }
  }
  func centralManager(_ manager: CBCentralManager, didConnect p: CBPeripheral) {
    guard bleWanted else { bleFinish(p); return }
    p.discoverServices([bleService])
  }
  func centralManager(_ manager: CBCentralManager, didFailToConnect p: CBPeripheral, error: Error?) {
    bleConnecting.remove(p.identifier)
  }
  func centralManager(_ manager: CBCentralManager, didDisconnectPeripheral p: CBPeripheral, error: Error?) {
    bleConnecting.remove(p.identifier)
  }
  func peripheral(_ p: CBPeripheral, didDiscoverServices error: Error?) {
    guard error == nil, let gatt = p.services?.first(where: { $0.uuid == bleService }) else { bleFinish(p); return }
    p.discoverCharacteristics([bleCharacteristic], for: gatt)
  }
  func peripheral(_ p: CBPeripheral, didDiscoverCharacteristicsFor gatt: CBService, error: Error?) {
    guard error == nil, let c = gatt.characteristics?.first(where: { $0.uuid == bleCharacteristic }) else { bleFinish(p); return }
    p.readValue(for: c)
  }
  func peripheral(_ p: CBPeripheral, didUpdateValueFor c: CBCharacteristic, error: Error?) {
    defer { bleFinish(p) }
    guard error == nil, c.uuid == bleCharacteristic, let data = c.value, data.count == 16 else { return }
    var raw = uuid_t(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
    withUnsafeMutableBytes(of: &raw) { data.copyBytes(to: $0) }
    let remote = UUID(uuid: raw).uuidString.lowercased()
    guard remote != token?.lowercased() else { return }
    bleTokens[p.identifier] = (remote, Date())
    emit?("onSighting", ["token": remote, "distanceCm": NSNull(), "precise": false])
  }
  func peripheral(_ p: CBPeripheral, didReadRSSI RSSI: NSNumber, error: Error?) {}
}
extension TapManager: CBPeripheralManagerDelegate {
  func peripheralManagerDidUpdateState(_ manager: CBPeripheralManager) {
    guard manager === peripheral else { return }
    if manager.state == .poweredOn { startAdvertising() }
  }
  func peripheralManager(_ manager: CBPeripheralManager, didAdd gatt: CBService, error: Error?) {
    guard bleWanted, manager === peripheral else { return }
    if let error { fail("advertise_failed", error); return }
    manager.startAdvertising([CBAdvertisementDataServiceUUIDsKey: [bleService]])
  }
  func peripheralManagerDidStartAdvertising(_ manager: CBPeripheralManager, error: Error?) {
    if let error, bleWanted { fail("advertise_failed", error) }
  }
  func peripheralManager(_ manager: CBPeripheralManager, didReceiveRead request: CBATTRequest) {
    guard request.characteristic.uuid == bleCharacteristic, let tokenData else {
      manager.respond(to: request, withResult: .attributeNotFound); return
    }
    guard request.offset <= tokenData.count else { manager.respond(to: request, withResult: .invalidOffset); return }
    request.value = tokenData.subdata(in: request.offset..<tokenData.count)
    manager.respond(to: request, withResult: .success)
  }
}
