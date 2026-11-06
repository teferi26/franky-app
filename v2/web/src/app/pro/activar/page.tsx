import ActivationFlow from "./activation-flow";

export const metadata = {
  title: "Activa tu espacio de Franky Pro",
  robots: { index: false, follow: false },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <ActivationFlow
      workspaceId={typeof params.workspace === "string" ? params.workspace : ""}
      orderId={typeof params.order === "string" ? params.order : ""}
      cancelled={params.return === "cancel"}
    />
  );
}
