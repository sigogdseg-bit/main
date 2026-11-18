import { createFileRoute } from "@tanstack/react-router";
import { VigilantesView } from "@/features/vigilantes/components/VigilantesView";
import { useAuth } from "@/features/auth/context/AuthContext";
import { podeAcessarModulo } from "@/shared/lib/permissoesModulos";
import { AcessoModuloRestrito } from "@/shared/components/AcessoModuloRestrito";

export const Route = createFileRoute("/_authenticated/vigilantes")({
  component: VigilantesRoute,
});

function VigilantesRoute() {
  const { session } = useAuth();

  if (!podeAcessarModulo(session, "vigilantes")) {
    return (
      <AcessoModuloRestrito
        moduloNome="Módulo Vigilante e Rondas"
        mensagem="O módulo de rastreamento de vigilantes e auditoria de rondas táticas não foi liberado para o seu perfil."
      />
    );
  }

  return <VigilantesView />;
}
