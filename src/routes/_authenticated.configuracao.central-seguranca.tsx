import { createFileRoute } from "@tanstack/react-router";
import { CentralSegurancaView } from "@/features/seguranca/components/CentralSegurancaView";
import { useAuth } from "@/features/auth/context/AuthContext";
import { AcessoModuloRestrito } from "@/shared/components/AcessoModuloRestrito";

export const Route = createFileRoute("/_authenticated/configuracao/central-seguranca")({
  component: CentralSegurancaRoute,
});

function CentralSegurancaRoute() {
  const { session } = useAuth();

  if (!session?.isAdmin && !session?.isAuditor) {
    return (
      <AcessoModuloRestrito
        moduloNome="Central de Segurança"
        mensagem="O painel de governança cibernética e auditoria de políticas RLS é de acesso exclusivo de Administradores e Auditores."
      />
    );
  }

  return <CentralSegurancaView />;
}
