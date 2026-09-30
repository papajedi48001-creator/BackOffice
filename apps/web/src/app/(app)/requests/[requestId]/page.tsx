import { RequestDetailPanel } from './request-detail-panel';

export default async function RequestDetailPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  return <RequestDetailPanel requestId={requestId} />;
}
