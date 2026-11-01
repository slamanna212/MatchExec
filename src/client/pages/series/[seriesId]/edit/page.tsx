import { useParams } from 'react-router';
import { EditSeriesPage } from '@/components/series/edit-series-page';

export default function SeriesEditPage() {
  const { seriesId } = useParams() as { seriesId: string };
  return <EditSeriesPage seriesId={seriesId} />;
}
