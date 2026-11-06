package es.franky.tap

import android.Manifest
import android.bluetooth.*
import android.os.Handler
import android.os.Looper
import java.util.concurrent.ConcurrentHashMap
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.ParcelUuid
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.nio.ByteBuffer
import java.util.UUID

// Identificador de servicio propio de Franky. Cualquier telefono con la
// aplicacion abierta anuncia y filtra por este uuid, asi que el rastreo no ve
// ni molesta a dispositivos ajenos.
private val SERVICIO: ParcelUuid = ParcelUuid.fromString("7f2a9c10-4b6d-4f3e-9a51-f1a0c7d3e880")

// Por encima de esta potencia los telefonos estan practicamente pegados. El
// valor es conservador a proposito: mas permisivo empezaria a contar a gente
// que solo pasaba cerca.
private val TOKEN_CHARACTERISTIC = UUID.fromString("7f2a9c11-4b6d-4f3e-9a51-f1a0c7d3e880")
private const val UMBRAL_RSSI = -52
private const val LECTURAS_NECESARIAS = 2
private const val VENTANA_MS = 2_500L
private const val SILENCIO_MS = 5_000L

class FrankyTapModule : Module() {
  private val contexto: Context
    get() = appContext.reactContext ?: throw IllegalStateException("sin contexto")

  private var adaptador: BluetoothAdapter? = null
  private var anunciante: BluetoothLeAdvertiser? = null
  private var rastreador: BluetoothLeScanner? = null
  private var anuncioActivo: AdvertiseCallback? = null
  private var rastreoActivo: ScanCallback? = null

  private var server: BluetoothGattServer? = null
  private var ownToken: ByteArray? = null
  @Volatile private var session = 0
  private val handler = Handler(Looper.getMainLooper())
  private val connections = ConcurrentHashMap<String, BluetoothGatt>()
  private val peers = ConcurrentHashMap<String, Pair<String, Long>>()
  private val connecting = ConcurrentHashMap.newKeySet<String>()
  private val lecturas = mutableMapOf<String, MutableList<Long>>()
  private val ultimoTap = mutableMapOf<String, Long>()

  private fun permisos(): Array<String> =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      arrayOf(
        Manifest.permission.BLUETOOTH_SCAN,
        Manifest.permission.BLUETOOTH_ADVERTISE,
        Manifest.permission.BLUETOOTH_CONNECT,
      )
    } else {
      arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
    }

  private fun faltanPermisos(): Boolean = permisos().any {
    ContextCompat.checkSelfPermission(contexto, it) != PackageManager.PERMISSION_GRANTED
  }

  private fun capacidad(): Map<String, Any> {
    val gestor = contexto.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    val adapt = gestor?.adapter
    adaptador = adapt

    if (adapt == null) {
      return mapOf("available" to false, "precise" to false, "reason" to "no_hardware")
    }
    if (faltanPermisos()) return mapOf("available" to false, "precise" to false, "reason" to "no_permission")
    if (!adapt.isEnabled) return mapOf("available" to false, "precise" to false, "reason" to "radio_off")
    // Sin capacidad de anunciar solo podriamos escuchar, y hacen falta las dos
    // partes para que el gesto funcione en los dos sentidos.
    if (!adapt.isMultipleAdvertisementSupported) {
      return mapOf("available" to false, "precise" to false, "reason" to "no_hardware")
    }
    // "precise" queda en falso siempre: la potencia de senal no es una medida
    // de distancia fiable y la pantalla lo dice con honestidad.
    return mapOf("available" to true, "precise" to false, "reason" to "ok")
  }

  private fun uuidABytes(uuid: UUID): ByteArray =
    ByteBuffer.allocate(16)
      .putLong(uuid.mostSignificantBits)
      .putLong(uuid.leastSignificantBits)
      .array()

  private fun bytesAUuid(bytes: ByteArray): UUID? {
    if (bytes.size != 16) return null
    val buffer = ByteBuffer.wrap(bytes)
    return UUID(buffer.long, buffer.long)
  }

  @Synchronized private fun confirmar(token: String, rssi: Int) {
    val ahora = System.currentTimeMillis()
    ultimoTap[token]?.let { if (ahora - it < SILENCIO_MS) return }

    val previas = lecturas.getOrPut(token) { mutableListOf() }
    previas.removeAll { ahora - it > VENTANA_MS }
    previas.add(ahora)
    if (previas.size < LECTURAS_NECESARIAS) return

    previas.clear()
    ultimoTap[token] = ahora
    sendEvent("onTap", mapOf("token" to token, "distanceCm" to null, "precise" to false, "rssi" to rssi))
  }

  override fun definition() = ModuleDefinition {
    Name("FrankyTap")

    Events("onSighting", "onTap", "onError")

    AsyncFunction("isAvailable") {
      return@AsyncFunction capacidad()
    }

    AsyncFunction("requestPermissions") { promesa: expo.modules.kotlin.Promise ->
      val pendientes = permisos().filter {
        ContextCompat.checkSelfPermission(contexto, it) != PackageManager.PERMISSION_GRANTED
      }
      if (pendientes.isEmpty()) {
        promesa.resolve(capacidad())
        return@AsyncFunction
      }
      val gestorPermisos = appContext.permissions
      if (gestorPermisos == null) {
        promesa.resolve(capacidad())
        return@AsyncFunction
      }
      gestorPermisos.askForPermissions({ _ ->
        promesa.resolve(capacidad())
      }, *pendientes.toTypedArray())
    }

    AsyncFunction("start") { token: String ->
      val estado = capacidad()
      if (estado["available"] != true) {
        sendEvent("onError", mapOf("code" to (estado["reason"] ?: "unavailable"), "message" to "No se puede activar la radio."))
        return@AsyncFunction
      }
      val uuid = runCatching { UUID.fromString(token) }.getOrNull()
        ?: throw IllegalArgumentException("testigo con formato invalido")

      pararTodo()

      val adapt = adaptador ?: return@AsyncFunction
      anunciante = adapt.bluetoothLeAdvertiser
      rastreador = adapt.bluetoothLeScanner

      val activeSession = session
      ownToken = uuidABytes(uuid)
      val manager = contexto.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
      val announcement = object : AdvertiseCallback() {
        override fun onStartFailure(errorCode: Int) {
          if (activeSession == session) sendEvent("onError", mapOf("code" to "advertise_failed", "message" to "No se pudo anunciar ($errorCode)."))
        }
      }
      anuncioActivo = announcement
      // Legacy BLE allows 31 bytes. Only the service UUID is advertised (18 bytes
      // plus flags). The 16-byte opaque token travels through a read-only GATT characteristic.
      val data = AdvertiseData.Builder().setIncludeDeviceName(false).addServiceUuid(SERVICIO).build()
      val settings = AdvertiseSettings.Builder().setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
        .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH).setConnectable(true).build()
      server = manager.openGattServer(contexto, object : BluetoothGattServerCallback() {
        override fun onServiceAdded(status: Int, service: BluetoothGattService) {
          if (activeSession != session) return
          if (status != BluetoothGatt.GATT_SUCCESS) {
            sendEvent("onError", mapOf("code" to "gatt_failed", "message" to "No se pudo preparar la conexión.")); return
          }
          runCatching { anunciante?.startAdvertising(settings, data, announcement) }
            .onFailure { sendEvent("onError", mapOf("code" to "advertise_failed", "message" to "No se pudo anunciar.")) }
        }
        override fun onCharacteristicReadRequest(device: BluetoothDevice, requestId: Int, offset: Int, characteristic: BluetoothGattCharacteristic) {
          if (activeSession != session) return
          val bytes = ownToken
          if (characteristic.uuid != TOKEN_CHARACTERISTIC || bytes == null || offset !in 0..bytes.size) {
            server?.sendResponse(device, requestId, BluetoothGatt.GATT_INVALID_OFFSET, offset, null); return
          }
          server?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, bytes.copyOfRange(offset, bytes.size))
        }
      }) ?: throw IllegalStateException("No se pudo abrir GATT")
      val service = BluetoothGattService(SERVICIO.uuid, BluetoothGattService.SERVICE_TYPE_PRIMARY)
      service.addCharacteristic(BluetoothGattCharacteristic(TOKEN_CHARACTERISTIC, BluetoothGattCharacteristic.PROPERTY_READ, BluetoothGattCharacteristic.PERMISSION_READ))
      if (server?.addService(service) != true) throw IllegalStateException("No se pudo añadir el servicio")

      val filtro = ScanFilter.Builder().setServiceUuid(SERVICIO).build()
      val ajustesRastreo = ScanSettings.Builder()
        .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
        .build()

      val rastreo = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
          if (activeSession != session) return
          val address = result.device.address
          val cached = peers[address]
          if (cached != null && System.currentTimeMillis() - cached.second < 15_000) {
            if (cached.first == token) return
            sendEvent("onSighting", mapOf("token" to cached.first, "distanceCm" to null, "precise" to false, "rssi" to result.rssi))
            if (result.rssi >= UMBRAL_RSSI) confirmar(cached.first, result.rssi)
            return
          }
          // Bound active connections and only discover strong signals. RSSI does
          // not establish consent or reliable physical distance.
          if (result.rssi < -65 || connecting.size >= 4 || !connecting.add(address)) return
          val callback = object : BluetoothGattCallback() {
            private fun finish(gatt: BluetoothGatt) {
              if (activeSession == session && connections.remove(address, gatt)) connecting.remove(address)
              runCatching { gatt.disconnect(); gatt.close() }
            }
            override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
              if (activeSession != session || status != BluetoothGatt.GATT_SUCCESS) { finish(gatt); return }
              if (newState == BluetoothProfile.STATE_CONNECTED) {
                if (!gatt.discoverServices()) finish(gatt)
              } else if (newState == BluetoothProfile.STATE_DISCONNECTED) finish(gatt)
            }
            override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
              if (activeSession != session || status != BluetoothGatt.GATT_SUCCESS) { finish(gatt); return }
              val characteristic = gatt.getService(SERVICIO.uuid)?.getCharacteristic(TOKEN_CHARACTERISTIC)
              if (characteristic == null || !gatt.readCharacteristic(characteristic)) finish(gatt)
            }
            private fun received(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray, status: Int) {
              if (activeSession == session && status == BluetoothGatt.GATT_SUCCESS && characteristic.uuid == TOKEN_CHARACTERISTIC) {
                bytesAUuid(value)?.toString()?.let { remote -> peers[address] = Pair(remote, System.currentTimeMillis()) }
              }
              finish(gatt)
            }
            @Deprecated("Compatibility callback for Android before API 33")
            override fun onCharacteristicRead(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
              if (Build.VERSION.SDK_INT < 33) received(gatt, characteristic, characteristic.value ?: byteArrayOf(), status)
            }
            override fun onCharacteristicRead(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray, status: Int) {
              received(gatt, characteristic, value, status)
            }
          }
          runCatching { result.device.connectGatt(contexto, false, callback, BluetoothDevice.TRANSPORT_LE) }
            .onSuccess { gatt ->
              if (gatt == null) { connecting.remove(address) }
              else if (activeSession != session) { runCatching { gatt.disconnect(); gatt.close() } }
              else {
                connections[address] = gatt
                handler.postDelayed({
                  if (connections.remove(address, gatt)) { connecting.remove(address); runCatching { gatt.disconnect(); gatt.close() } }
                }, 8_000)
              }
            }.onFailure { connecting.remove(address) }
        }

        override fun onScanFailed(errorCode: Int) {
          if (activeSession != session) return
          sendEvent("onError", mapOf("code" to "scan_failed", "message" to "No se pudo rastrear ($errorCode)."))
        }
      }
      rastreoActivo = rastreo
      runCatching { rastreador?.startScan(listOf(filtro), ajustesRastreo, rastreo) }
        .onFailure { sendEvent("onError", mapOf("code" to "no_permission", "message" to "Falta permiso de Bluetooth.")) }
    }

    AsyncFunction("stop") {
      pararTodo()
    }

    OnDestroy {
      pararTodo()
    }
  }

  @Synchronized private fun pararTodo() {
    session++
    ownToken = null
    runCatching { server?.close() }; server = null
    connections.values.forEach { runCatching { it.disconnect(); it.close() } }
    connections.clear(); connecting.clear(); peers.clear()
    handler.removeCallbacksAndMessages(null)
    runCatching { anuncioActivo?.let { anunciante?.stopAdvertising(it) } }
    runCatching { rastreoActivo?.let { rastreador?.stopScan(it) } }
    anuncioActivo = null
    rastreoActivo = null
    lecturas.clear()
    ultimoTap.clear()
  }
}
