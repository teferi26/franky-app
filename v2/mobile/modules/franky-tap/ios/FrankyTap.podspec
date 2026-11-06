Pod::Spec.new do |s|
  s.name           = 'FrankyTap'
  s.version        = '2.0.0'
  s.summary        = 'Proximidad precisa entre iPhone para comparar afinidad en Crush Live.'
  s.description    = 'Descubrimiento por MultipeerConnectivity y medida de distancia con NearbyInteraction (banda ultraancha).'
  s.author         = 'Franky'
  s.homepage       = 'https://franky.es'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Sin esto, Swift no encuentra los simbolos de Expo al compilar el pod.
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
