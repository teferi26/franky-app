-- =====================================================================
-- 169: alquilar por habitaciones + avisar a quien busca piso en la provincia
--
-- LO QUE PIDEN LOS PROPIETARIOS (17-ago-2026): poder pasar un piso entero a
-- alquiler por habitaciones (a ver si así les funciona mejor) y que la gente
-- que está buscando piso en esa provincia se entere de que ese piso está
-- disponible.
--
-- 1. provincia_de(texto): la base de datos no tenía noción de provincia. Los
--    perfiles guardan la ciudad como texto libre ("San Vicente del raspeig",
--    "Aspe", "Ibi", "Benidorm", "Alcoy", "Elche"... todo eso es Alicante) y las
--    universidades tienen ciudad. Se añade una tabla de localidades ->
--    provincia con las capitales, todas las ciudades con universidad y los
--    municipios grandes de las provincias con estudiantes, y una función que
--    normaliza el texto (minúsculas, sin tildes, lo de antes de la coma) y lo
--    resuelve. Lo que no reconoce devuelve NULL, nunca inventa.
--
-- 2. notify_housing_seekers(piso, motivo): inserta en `notifications` (tipo
--    'accommodation') para cada persona con looking_for_housing = true cuya
--    ciudad, ciudad deseada o universidad caen en la misma provincia que el
--    piso (o en la misma universidad cercana). El trigger de la 125/127 se
--    encarga de mandar el push, y a partir de aquí también el email. Un aviso
--    por persona, piso y motivo cada 30 días: no hay forma de que un
--    propietario que cambia de idea tres veces spamee a nadie.
--
-- 3. set_accommodation_rental_mode(piso, 'habitaciones'|'entero', precio,
--    habitaciones_libres): lo que llama el panel del propietario. Cambia el
--    tipo y el precio, y si el piso está visible avisa. Devuelve cuántas
--    personas han sido avisadas y de qué provincia, para enseñárselo.
--
-- 4. Trigger: cuando un piso pasa a estar VISIBLE (activo + pagado + no
--    archivado) sin estarlo antes, avisa igual ("piso nuevo en tu zona"). Es la
--    misma petición: que se enteren de que el piso está disponible.
--
-- Idempotente: se puede pegar en el editor SQL de Supabase tal cual.
-- =====================================================================

-- ---------------------------------------------------------------
-- 1. Localidades -> provincia
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provincias_localidades (
    localidad TEXT PRIMARY KEY,   -- ya normalizada (minúsculas, sin tildes)
    provincia TEXT NOT NULL
);

ALTER TABLE public.provincias_localidades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "provincias_localidades_lectura" ON public.provincias_localidades;
CREATE POLICY "provincias_localidades_lectura"
    ON public.provincias_localidades FOR SELECT USING (true);

/** Normaliza un topónimo escrito a mano: minúsculas, sin tildes ni diéresis,
    sin lo que venga tras una coma o un guion (barrio, aclaración), espacios
    colapsados. "San Vicente del Raspeig, Alucage" -> "san vicente del raspeig". */
CREATE OR REPLACE FUNCTION public.normalizar_localidad(p_texto TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT NULLIF(
        btrim(regexp_replace(
            translate(
                lower(split_part(split_part(COALESCE(p_texto, ''), ',', 1), ' - ', 1)),
                'áàäâãéèëêíìïîóòöôõúùüûñç',
                'aaaaaeeeeiiiiooooouuuunc'
            ),
            '\s+', ' ', 'g'
        )),
    '');
$$;

-- DISTINCT ON: varias grafías de la lista ('Gandía'/'Gandia', 'Córdoba'/
-- 'Cordoba') normalizan al mismo texto y ON CONFLICT no admite dos veces la
-- misma clave en una sola sentencia.
INSERT INTO public.provincias_localidades (localidad, provincia)
SELECT DISTINCT ON (public.normalizar_localidad(l)) public.normalizar_localidad(l), p FROM (VALUES
  -- Comunidad Valenciana
  ('Alicante','Alicante'),('Alacant','Alicante'),('San Vicente del Raspeig','Alicante'),('Sant Vicent del Raspeig','Alicante'),
  ('San Vicente','Alicante'),('Elche','Alicante'),('Elx','Alicante'),('Orihuela','Alicante'),('Alcoy','Alicante'),('Alcoi','Alicante'),
  ('Benidorm','Alicante'),('Altea','Alicante'),('Aspe','Alicante'),('Ibi','Alicante'),('Elda','Alicante'),('Petrer','Alicante'),
  ('Villena','Alicante'),('Denia','Alicante'),('Dénia','Alicante'),('Torrevieja','Alicante'),('Crevillente','Alicante'),('Novelda','Alicante'),
  ('Muchamiel','Alicante'),('Mutxamel','Alicante'),('El Campello','Alicante'),('Campello','Alicante'),('San Juan de Alicante','Alicante'),
  ('Sant Joan d''Alacant','Alicante'),('Villajoyosa','Alicante'),('La Vila Joiosa','Alicante'),('Calpe','Alicante'),('Calp','Alicante'),
  ('Jávea','Alicante'),('Xàbia','Alicante'),('Santa Pola','Alicante'),('Callosa de Segura','Alicante'),('Almoradí','Alicante'),
  ('Pilar de la Horadada','Alicante'),('Guardamar del Segura','Alicante'),('Guardamar','Alicante'),('Monóvar','Alicante'),('Cocentaina','Alicante'),
  ('Valencia','Valencia'),('València','Valencia'),('Burjassot','Valencia'),('Paterna','Valencia'),('Gandía','Valencia'),('Gandia','Valencia'),
  ('Torrent','Valencia'),('Torrente','Valencia'),('Sagunto','Valencia'),('Sagunt','Valencia'),('Alzira','Valencia'),('Xàtiva','Valencia'),('Játiva','Valencia'),
  ('Ontinyent','Valencia'),('Onteniente','Valencia'),('Mislata','Valencia'),('Manises','Valencia'),('Alboraya','Valencia'),('Alboraia','Valencia'),
  ('Moncada','Valencia'),('Montcada','Valencia'),('Vallada','Valencia'),('Requena','Valencia'),('Sueca','Valencia'),('Cullera','Valencia'),
  ('Quart de Poblet','Valencia'),('Aldaia','Valencia'),('Alaquàs','Valencia'),('Catarroja','Valencia'),('Paiporta','Valencia'),
  ('Castellón','Castellón'),('Castellón de la Plana','Castellón'),('Castelló','Castellón'),('Castelló de la Plana','Castellón'),
  ('Vila-real','Castellón'),('Villarreal','Castellón'),('Burriana','Castellón'),('Vinaròs','Castellón'),('Vinaroz','Castellón'),
  ('Ribera de Cabanes','Castellón'),('Cabanes','Castellón'),('Benicàssim','Castellón'),('Benicasim','Castellón'),('Almassora','Castellón'),
  -- Murcia
  ('Murcia','Murcia'),('Cartagena','Murcia'),('Lorca','Murcia'),('Molina de Segura','Murcia'),('Beniel','Murcia'),('Alcantarilla','Murcia'),
  ('Cieza','Murcia'),('Yecla','Murcia'),('Jumilla','Murcia'),('Águilas','Murcia'),('Mazarrón','Murcia'),('Torre Pacheco','Murcia'),
  ('San Javier','Murcia'),('Espinardo','Murcia'),('Caravaca de la Cruz','Murcia'),('Totana','Murcia'),('Alhama de Murcia','Murcia'),
  ('San Pedro del Pinatar','Murcia'),('Las Torres de Cotillas','Murcia'),('Archena','Murcia'),
  -- Madrid
  ('Madrid','Madrid'),('Alcalá de Henares','Madrid'),('Getafe','Madrid'),('Leganés','Madrid'),('Móstoles','Madrid'),('Fuenlabrada','Madrid'),
  ('Alcorcón','Madrid'),('Pozuelo de Alarcón','Madrid'),('Villaviciosa de Odón','Madrid'),('Villanueva de la Cañada','Madrid'),
  ('Collado Villalba','Madrid'),('Majadahonda','Madrid'),('Las Rozas','Madrid'),('Las Rozas de Madrid','Madrid'),('Boadilla del Monte','Madrid'),
  ('Alcobendas','Madrid'),('San Sebastián de los Reyes','Madrid'),('Torrejón de Ardoz','Madrid'),('Coslada','Madrid'),
  ('Rivas-Vaciamadrid','Madrid'),('Rivas','Madrid'),('Parla','Madrid'),('Aranjuez','Madrid'),('Valdemorillo','Madrid'),('Tres Cantos','Madrid'),
  ('Colmenar Viejo','Madrid'),('Pinto','Madrid'),('Valdemoro','Madrid'),('Arganda del Rey','Madrid'),('San Fernando de Henares','Madrid'),
  ('Villanueva del Pardillo','Madrid'),('Galapagar','Madrid'),('Torrelodones','Madrid'),
  -- Cataluña
  ('Barcelona','Barcelona'),('Barna','Barcelona'),('Sardañola del Vallés','Barcelona'),('Cerdanyola del Vallès','Barcelona'),('Cerdanyola','Barcelona'),
  ('Bellaterra','Barcelona'),('Sant Cugat del Vallès','Barcelona'),('Sant Cugat','Barcelona'),('Terrassa','Barcelona'),('Sabadell','Barcelona'),
  ('Badalona','Barcelona'),('L''Hospitalet de Llobregat','Barcelona'),('Hospitalet','Barcelona'),('Mataró','Barcelona'),('Manresa','Barcelona'),
  ('Vic','Barcelona'),('Castelldefels','Barcelona'),('Cornellà de Llobregat','Barcelona'),('Cornellà','Barcelona'),('Esplugues de Llobregat','Barcelona'),
  ('Sant Boi de Llobregat','Barcelona'),('Granollers','Barcelona'),('Igualada','Barcelona'),('Vilanova i la Geltrú','Barcelona'),('Pallejà','Barcelona'),
  ('Sant Adrià de Besòs','Barcelona'),('Sant Joan Despí','Barcelona'),('Sant Feliu de Llobregat','Barcelona'),('Mollet del Vallès','Barcelona'),
  ('Rubí','Barcelona'),('Viladecans','Barcelona'),('El Prat de Llobregat','Barcelona'),('Vilafranca del Penedès','Barcelona'),
  ('Girona','Girona'),('Gerona','Girona'),('Olot','Girona'),('Banyoles','Girona'),('Figueres','Girona'),('Salt','Girona'),('Blanes','Girona'),('Lloret de Mar','Girona'),
  ('Lleida','Lleida'),('Lérida','Lleida'),('Tarragona','Tarragona'),('Reus','Tarragona'),('Tortosa','Tarragona'),('Salou','Tarragona'),
  -- Andalucía
  ('Sevilla','Sevilla'),('Bormujos','Sevilla'),('Dos Hermanas','Sevilla'),('Utrera','Sevilla'),('Alcalá de Guadaíra','Sevilla'),('Mairena del Aljarafe','Sevilla'),
  ('Tomares','Sevilla'),('Camas','Sevilla'),('Écija','Sevilla'),
  ('Granada','Granada'),('Motril','Granada'),('Armilla','Granada'),('Maracena','Granada'),('La Zubia','Granada'),('Ogíjares','Granada'),
  ('Málaga','Málaga'),('Marbella','Málaga'),('Fuengirola','Málaga'),('Torremolinos','Málaga'),('Antequera','Málaga'),('Ronda','Málaga'),
  ('Vélez-Málaga','Málaga'),('Vélez Málaga','Málaga'),('Teatinos','Málaga'),('Benalmádena','Málaga'),('Estepona','Málaga'),('Mijas','Málaga'),
  ('Cádiz','Cádiz'),('Jerez','Cádiz'),('Jerez de la Frontera','Cádiz'),('Puerto Real','Cádiz'),('Algeciras','Cádiz'),('San Fernando','Cádiz'),
  ('Chiclana de la Frontera','Cádiz'),('Chiclana','Cádiz'),('El Puerto de Santa María','Cádiz'),('Sanlúcar de Barrameda','Cádiz'),('La Línea de la Concepción','Cádiz'),
  ('Córdoba','Córdoba'),('Cordoba','Córdoba'),('Lucena','Córdoba'),('Puente Genil','Córdoba'),('Montilla','Córdoba'),
  ('Jaén','Jaén'),('Linares','Jaén'),('Úbeda','Jaén'),('Andújar','Jaén'),('Martos','Jaén'),
  ('Almería','Almería'),('El Ejido','Almería'),('Roquetas de Mar','Almería'),('Níjar','Almería'),('Adra','Almería'),
  ('Huelva','Huelva'),('Lepe','Huelva'),('Almonte','Huelva'),
  -- Aragón
  ('Zaragoza','Zaragoza'),('Villanueva de Gállego','Zaragoza'),('Utebo','Zaragoza'),('Calatayud','Zaragoza'),('Cuarte de Huerva','Zaragoza'),
  ('Huesca','Huesca'),('Barbastro','Huesca'),('Jaca','Huesca'),('Teruel','Teruel'),
  -- Castilla y León
  ('Salamanca','Salamanca'),('Villamayor','Salamanca'),('Béjar','Salamanca'),('Valladolid','Valladolid'),('Laguna de Duero','Valladolid'),
  ('León','León'),('Ponferrada','León'),('San Andrés del Rabanedo','León'),('Burgos','Burgos'),('Miranda de Ebro','Burgos'),('Aranda de Duero','Burgos'),
  ('Segovia','Segovia'),('Ávila','Ávila'),('Zamora','Zamora'),('Palencia','Palencia'),('Soria','Soria'),
  -- Castilla-La Mancha
  ('Toledo','Toledo'),('Talavera de la Reina','Toledo'),('Illescas','Toledo'),('Ciudad Real','Ciudad Real'),('Puertollano','Ciudad Real'),
  ('Albacete','Albacete'),('Hellín','Albacete'),('Almansa','Albacete'),('Cuenca','Cuenca'),('Guadalajara','Guadalajara'),('Azuqueca de Henares','Guadalajara'),
  -- Extremadura
  ('Cáceres','Cáceres'),('Plasencia','Cáceres'),('Badajoz','Badajoz'),('Mérida','Badajoz'),('Don Benito','Badajoz'),
  -- Norte
  ('Oviedo','Asturias'),('Gijón','Asturias'),('Avilés','Asturias'),('Mieres','Asturias'),('Pola de Siero','Asturias'),('Siero','Asturias'),('Langreo','Asturias'),
  ('Santander','Cantabria'),('Torrelavega','Cantabria'),('Castro Urdiales','Cantabria'),
  ('Bilbao','Bizkaia'),('Bilbo','Bizkaia'),('Lejona','Bizkaia'),('Leioa','Bizkaia'),('Getxo','Bizkaia'),('Barakaldo','Bizkaia'),('Portugalete','Bizkaia'),('Basauri','Bizkaia'),
  ('San Sebastián','Gipuzkoa'),('Donostia','Gipuzkoa'),('Donostia-San Sebastián','Gipuzkoa'),('Mondragón','Gipuzkoa'),('Arrasate','Gipuzkoa'),('Irún','Gipuzkoa'),('Eibar','Gipuzkoa'),
  ('Vitoria','Álava'),('Vitoria-Gasteiz','Álava'),('Gasteiz','Álava'),
  ('Pamplona','Navarra'),('Iruña','Navarra'),('Tudela','Navarra'),
  ('Logroño','La Rioja'),('Quel','La Rioja'),('Calahorra','La Rioja'),('Arnedo','La Rioja'),('Haro','La Rioja'),
  -- Galicia
  ('La Coruña','A Coruña'),('A Coruña','A Coruña'),('Coruña','A Coruña'),('Santiago de Compostela','A Coruña'),('Santiago','A Coruña'),('Ferrol','A Coruña'),
  ('Vigo','Pontevedra'),('Pontevedra','Pontevedra'),('Lugo','Lugo'),('Ourense','Ourense'),('Orense','Ourense'),
  -- Islas, Ceuta y Melilla
  ('Palma','Illes Balears'),('Palma de Mallorca','Illes Balears'),('Ibiza','Illes Balears'),('Eivissa','Illes Balears'),('Mahón','Illes Balears'),('Maó','Illes Balears'),
  ('Las Palmas de Gran Canaria','Las Palmas'),('Las Palmas','Las Palmas'),('Telde','Las Palmas'),('Arrecife','Las Palmas'),('Puerto del Rosario','Las Palmas'),
  ('La Oliva','Las Palmas'),('Santa María de Guía de Gran Canaria','Las Palmas'),('Santa María de Guía','Las Palmas'),
  ('Santa Cruz de Tenerife','Santa Cruz de Tenerife'),('San Cristóbal de La Laguna','Santa Cruz de Tenerife'),('La Laguna','Santa Cruz de Tenerife'),
  ('La Orotava','Santa Cruz de Tenerife'),('Adeje','Santa Cruz de Tenerife'),('Arona','Santa Cruz de Tenerife'),
  ('Ceuta','Ceuta'),('Melilla','Melilla')
) AS v(l, p)
ON CONFLICT (localidad) DO UPDATE SET provincia = EXCLUDED.provincia;

/** Provincia de un topónimo escrito a mano, o NULL si no se reconoce.
    Orden: coincidencia exacta normalizada; si no, la localidad más larga de la
    tabla contenida en el texto ("San Vicente del Raspeig - centro" cae en
    Alicante; "Pallejà, Barcelona" resuelve por Pallejà antes que por el sufijo). */
CREATE OR REPLACE FUNCTION public.provincia_de(p_texto TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_norm TEXT := public.normalizar_localidad(p_texto);
    v_prov TEXT;
BEGIN
    IF v_norm IS NULL OR length(v_norm) < 2 THEN
        RETURN NULL;
    END IF;

    SELECT provincia INTO v_prov FROM public.provincias_localidades WHERE localidad = v_norm;
    IF v_prov IS NOT NULL THEN
        RETURN v_prov;
    END IF;

    -- Coincidencia por contenido, la más larga primero y siempre de palabra
    -- entera: "vic" no debe casar dentro de "vicente".
    SELECT provincia INTO v_prov
      FROM public.provincias_localidades
     WHERE length(localidad) >= 4
       AND (' ' || v_norm || ' ') LIKE ('% ' || localidad || ' %')
     ORDER BY length(localidad) DESC
     LIMIT 1;

    RETURN v_prov;
END;
$$;

-- ---------------------------------------------------------------
-- 2. Avisar a quien busca piso en la provincia
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_housing_seekers(
    p_accommodation_id UUID,
    p_kind TEXT DEFAULT 'nuevo'      -- 'nuevo' | 'habitaciones'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_acc       RECORD;
    v_prov      TEXT;
    v_title     TEXT;
    v_body      TEXT;
    v_data      JSONB;
    v_count     INTEGER := 0;
    v_tipo      TEXT;
BEGIN
    SELECT a.id, a.owner_id, a.title, a.type, a.price, a.city, a.rooms_available,
           a.university_id, a.status, a.is_paid, a.deleted_at, u.city AS uni_city
      INTO v_acc
      FROM public.accommodations a
      LEFT JOIN public.universities u ON u.id = a.university_id
     WHERE a.id = p_accommodation_id;

    IF NOT FOUND THEN
        RETURN 0;
    END IF;
    -- Solo se avisa de lo que la gente puede ver de verdad.
    IF v_acc.status <> 'active' OR COALESCE(v_acc.is_paid, false) = false OR v_acc.deleted_at IS NOT NULL THEN
        RETURN 0;
    END IF;

    v_prov := COALESCE(public.provincia_de(v_acc.city), public.provincia_de(v_acc.uni_city));

    v_tipo := CASE v_acc.type
        WHEN 'habitacion' THEN 'Habitación'
        WHEN 'estudio' THEN 'Estudio'
        WHEN 'residencia' THEN 'Residencia'
        ELSE 'Piso' END;

    IF p_kind = 'habitaciones' THEN
        v_title := 'Piso por habitaciones en ' || COALESCE(v_acc.city, 'tu zona');
        v_body  := v_acc.title || ' · '
                   || COALESCE(trunc(v_acc.price)::text, '?') || ' €/mes por habitación'
                   || CASE WHEN COALESCE(v_acc.rooms_available, 0) > 0
                           THEN ' · ' || v_acc.rooms_available || CASE WHEN v_acc.rooms_available = 1 THEN ' libre' ELSE ' libres' END
                           ELSE '' END
                   || '. Ahora se alquila por habitaciones.';
    ELSE
        v_title := v_tipo || ' disponible en ' || COALESCE(v_acc.city, 'tu zona');
        v_body  := v_acc.title || ' · ' || COALESCE(trunc(v_acc.price)::text, '?') || ' €/mes';
    END IF;

    v_data := jsonb_build_object(
        'url', '/alojamiento/' || v_acc.id::text,
        'accommodation_id', v_acc.id::text,
        'kind', p_kind,
        'city', v_acc.city,
        'provincia', v_prov
    );

    WITH candidatos AS (
        SELECT p.id
          FROM public.profiles p
          LEFT JOIN public.universities pu ON pu.id = p.university_id
         WHERE p.looking_for_housing = true
           AND p.id <> v_acc.owner_id
           AND COALESCE(p.is_discarded, false) = false
           AND (
                -- misma provincia por cualquiera de sus tres anclas
                (v_prov IS NOT NULL AND (
                       public.provincia_de(p.city) = v_prov
                    OR public.provincia_de(p.desired_city) = v_prov
                    OR public.provincia_de(pu.city) = v_prov))
                -- provincia desconocida: al menos misma ciudad literal
             OR (v_prov IS NULL AND v_acc.city IS NOT NULL AND (
                       public.normalizar_localidad(p.city) = public.normalizar_localidad(v_acc.city)
                    OR public.normalizar_localidad(p.desired_city) = public.normalizar_localidad(v_acc.city)))
                -- misma universidad cercana, pase lo que pase con los nombres
             OR (v_acc.university_id IS NOT NULL AND p.university_id = v_acc.university_id)
           )
           -- un aviso por persona, piso y motivo cada 30 días
           AND NOT EXISTS (
                SELECT 1 FROM public.notifications n
                 WHERE n.user_id = p.id
                   AND n.type = 'accommodation'
                   AND n.data->>'accommodation_id' = v_acc.id::text
                   AND n.data->>'kind' = p_kind
                   AND n.created_at > NOW() - INTERVAL '30 days')
    ),
    insertados AS (
        INSERT INTO public.notifications (user_id, type, title, body, data)
        SELECT c.id, 'accommodation', v_title, v_body, v_data FROM candidatos c
        RETURNING 1
    )
    SELECT count(*) INTO v_count FROM insertados;

    RETURN v_count;
END;
$$;

-- Solo la llaman la RPC de abajo (SECURITY DEFINER) y el trigger. Si cualquier
-- sesión pudiera invocarla, alguien podría avisar a media provincia a voluntad.
REVOKE ALL ON FUNCTION public.notify_housing_seekers(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_housing_seekers(UUID, TEXT) TO service_role;

COMMENT ON FUNCTION public.notify_housing_seekers(UUID, TEXT) IS
  '169: avisa (in-app + push + email) a quien busca piso en la provincia del piso. Un aviso por persona/piso/motivo cada 30 días.';

-- ---------------------------------------------------------------
-- 3. Cambiar la modalidad de alquiler (piso entero <-> por habitaciones)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_accommodation_rental_mode(
    p_id              UUID,
    p_mode            TEXT,             -- 'habitaciones' | 'entero'
    p_price           NUMERIC,          -- €/mes por habitación o del piso entero
    p_rooms_available INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid    UUID := auth.uid();
    v_acc    RECORD;
    v_avisos INTEGER := 0;
    v_prov   TEXT;
    v_rooms  INTEGER;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'no_auth');
    END IF;
    IF p_mode NOT IN ('habitaciones', 'entero') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'modo_invalido');
    END IF;
    IF p_price IS NULL OR p_price <= 0 OR p_price > 99999999.99 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'precio_invalido');
    END IF;

    SELECT a.id, a.owner_id, a.type, a.rooms, a.status, a.is_paid, a.deleted_at, a.city, a.university_id
      INTO v_acc
      FROM public.accommodations a
     WHERE a.id = p_id
     FOR UPDATE;

    IF NOT FOUND OR (v_acc.owner_id <> v_uid AND NOT public.is_admin()) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not_found');
    END IF;
    IF v_acc.deleted_at IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'archivado');
    END IF;

    IF p_mode = 'habitaciones' THEN
        v_rooms := COALESCE(p_rooms_available, v_acc.rooms, 1);
        IF v_rooms < 1 OR v_rooms > 99 THEN
            RETURN jsonb_build_object('ok', false, 'error', 'habitaciones_invalidas');
        END IF;
        UPDATE public.accommodations
           SET type = 'habitacion',
               price = p_price,
               rooms_available = v_rooms,
               updated_at = NOW()
         WHERE id = p_id;
    ELSE
        UPDATE public.accommodations
           SET type = 'piso_completo',
               price = p_price,
               rooms_available = NULL,
               updated_at = NOW()
         WHERE id = p_id;
    END IF;

    -- Avisar solo tiene sentido si el piso se ve. Y solo al pasar a
    -- habitaciones: volver a "entero" no es una novedad para quien busca.
    IF p_mode = 'habitaciones' THEN
        v_avisos := public.notify_housing_seekers(p_id, 'habitaciones');
    END IF;

    v_prov := COALESCE(
        public.provincia_de(v_acc.city),
        (SELECT public.provincia_de(u.city) FROM public.universities u WHERE u.id = v_acc.university_id)
    );

    RETURN jsonb_build_object(
        'ok', true,
        'mode', p_mode,
        'avisados', v_avisos,
        'provincia', v_prov,
        'visible', (v_acc.status = 'active' AND COALESCE(v_acc.is_paid, false))
    );
END;
$$;

REVOKE ALL ON FUNCTION public.set_accommodation_rental_mode(UUID, TEXT, NUMERIC, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_accommodation_rental_mode(UUID, TEXT, NUMERIC, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.set_accommodation_rental_mode(UUID, TEXT, NUMERIC, INTEGER) IS
  '169: el propietario pasa su piso a alquiler por habitaciones (o vuelve a entero). Al pasar a habitaciones avisa a quien busca piso en la provincia.';

-- ---------------------------------------------------------------
-- 4. Piso que pasa a estar visible -> aviso "disponible en tu zona"
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_accommodation_visible_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_visible_ahora BOOLEAN := (NEW.status = 'active' AND COALESCE(NEW.is_paid, false) AND NEW.deleted_at IS NULL);
    v_visible_antes BOOLEAN := (TG_OP = 'UPDATE' AND OLD.status = 'active' AND COALESCE(OLD.is_paid, false) AND OLD.deleted_at IS NULL);
BEGIN
    IF v_visible_ahora AND NOT v_visible_antes THEN
        PERFORM public.notify_housing_seekers(NEW.id, 'nuevo');
    END IF;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Un aviso que falla nunca puede tumbar la publicación de un piso.
    RAISE WARNING '169 on_accommodation_visible_notify: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_accommodations_visible_notify ON public.accommodations;
CREATE TRIGGER trg_accommodations_visible_notify
    AFTER INSERT OR UPDATE OF status, is_paid, deleted_at ON public.accommodations
    FOR EACH ROW EXECUTE FUNCTION public.on_accommodation_visible_notify();

-- ---------------------------------------------------------------
-- 5. Las notificaciones de piso también van por email
-- ---------------------------------------------------------------
-- Cuerpo idéntico al de la 127 más 'accommodation' en la lista de email. El
-- endpoint /api/internal/notify-email aplica la preferencia "accommodation" de
-- notification_preferences (070) y un throttle de 12h por persona.
CREATE OR REPLACE FUNCTION public.on_notification_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.is_read, false) = false THEN
    PERFORM public.dispatch_push(
      NEW.user_id, NEW.title, NEW.body,
      COALESCE(NEW.data, '{}'::jsonb) || jsonb_build_object('type', NEW.type)
    );

    IF NEW.type IN ('message', 'match', 'roomie_like', 'comment', 'event', 'accommodation') THEN
      PERFORM public.dispatch_email(
        NEW.user_id, NEW.type, NEW.title, NEW.body, COALESCE(NEW.data, '{}'::jsonb)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
