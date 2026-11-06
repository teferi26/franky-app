import SpaceFrame from "./space-frame";

export default async function SpaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ space: string }>;
}) {
  const { space } = await params;
  return <SpaceFrame spaceId={space}>{children}</SpaceFrame>;
}
