import RunPage from "@/app/components/execution/RunPage";

export default async function ExecutionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RunPage executionId={id} />;
}
