import RepoDetailPage from "@/app/components/repo/RepoDetailPage";

export default async function RepositoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RepoDetailPage repositoryId={id} />;
}
