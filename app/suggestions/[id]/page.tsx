import SuggestionDetailPage from "@/app/components/suggestions/SuggestionDetailPage";

export default async function SuggestionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SuggestionDetailPage suggestionId={id} />;
}
