import { useParams } from 'react-router';
import { SeriesDetailPage } from '@/components/series/series-detail-page';

export default function SeriesPage() {
  const { seriesId } = useParams() as { seriesId: string };
  return <SeriesDetailPage seriesId={seriesId} />;
}
