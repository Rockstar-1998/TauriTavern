import { Navigate, useParams } from '@solidjs/router';
import type { JSX } from 'solid-js';

export default function CharacterDetailPage(): JSX.Element {
  const params = useParams();
  const selected = encodeURIComponent(decodeURIComponent(params.characterId ?? ''));
  return <Navigate href={`/characters?selected=${selected}`} />;
}
