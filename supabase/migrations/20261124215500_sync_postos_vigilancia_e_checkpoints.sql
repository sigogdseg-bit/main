-- ==============================================================================
-- HUNTER / GD RASTREAMENTO — SINCRONIZAÇÃO DE POSTOS DE VIGILÂNCIA E AJUSTE DE CHECKPOINTS
-- Migration: 20261124215500_sync_postos_vigilancia_e_checkpoints.sql
-- ==============================================================================

-- 1. Permite horario_previsto nulo ou com default '00:00:00' para rondas dinâmicas a pé
ALTER TABLE public.rondas_checkpoints ALTER COLUMN horario_previsto DROP NOT NULL;
ALTER TABLE public.rondas_checkpoints ALTER COLUMN horario_previsto SET DEFAULT '00:00:00'::time;

-- 2. Sincroniza postos existentes cadastrados em areas_seguras para a tabela postos_vigilancia
INSERT INTO public.postos_vigilancia (
  id,
  cliente_id,
  nome,
  endereco,
  latitude,
  longitude,
  raio_metros,
  perimetro_poligono,
  ativo,
  created_at,
  updated_at
)
SELECT
  a.id,
  a.cliente_id,
  a.nome,
  COALESCE(a.poligono_geojson->>'endereco', NULL),
  a.latitude,
  a.longitude,
  COALESCE(a.raio_metros, 100),
  CASE 
    WHEN a.poligono_geojson IS NOT NULL AND a.poligono_geojson ? 'coordinates' THEN
      jsonb_build_object('type', 'Polygon', 'coordinates', a.poligono_geojson->'coordinates')
    ELSE NULL
  END,
  COALESCE(a.ativo, true),
  COALESCE(a.created_at, now()),
  COALESCE(a.updated_at, now())
FROM public.areas_seguras a
WHERE a.tipo = 'posto_vigilancia'
ON CONFLICT (id) DO UPDATE SET
  nome = EXCLUDED.nome,
  endereco = EXCLUDED.endereco,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  raio_metros = EXCLUDED.raio_metros,
  perimetro_poligono = EXCLUDED.perimetro_poligono,
  ativo = EXCLUDED.ativo,
  updated_at = EXCLUDED.updated_at;

-- 3. Função e Trigger para manter postos sincronizados entre areas_seguras e postos_vigilancia
CREATE OR REPLACE FUNCTION public.fn_sync_areas_seguras_to_postos()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.tipo = 'posto_vigilancia' THEN
      DELETE FROM public.postos_vigilancia WHERE id = OLD.id;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.tipo = 'posto_vigilancia' THEN
    INSERT INTO public.postos_vigilancia (
      id, cliente_id, nome, endereco, latitude, longitude,
      raio_metros, perimetro_poligono, ativo, created_at, updated_at
    ) VALUES (
      NEW.id,
      NEW.cliente_id,
      NEW.nome,
      COALESCE(NEW.poligono_geojson->>'endereco', NULL),
      NEW.latitude,
      NEW.longitude,
      COALESCE(NEW.raio_metros, 100),
      CASE 
        WHEN NEW.poligono_geojson IS NOT NULL AND NEW.poligono_geojson ? 'coordinates' THEN
          jsonb_build_object('type', 'Polygon', 'coordinates', NEW.poligono_geojson->'coordinates')
        ELSE NULL
      END,
      COALESCE(NEW.ativo, true),
      COALESCE(NEW.created_at, now()),
      COALESCE(NEW.updated_at, now())
    )
    ON CONFLICT (id) DO UPDATE SET
      cliente_id = EXCLUDED.cliente_id,
      nome = EXCLUDED.nome,
      endereco = EXCLUDED.endereco,
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      raio_metros = EXCLUDED.raio_metros,
      perimetro_poligono = EXCLUDED.perimetro_poligono,
      ativo = EXCLUDED.ativo,
      updated_at = EXCLUDED.updated_at;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_areas_seguras_to_postos ON public.areas_seguras;
CREATE TRIGGER trg_sync_areas_seguras_to_postos
AFTER INSERT OR UPDATE OR DELETE ON public.areas_seguras
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_areas_seguras_to_postos();

NOTIFY pgrst, 'reload schema';
