import { useNavigate } from '@solidjs/router';
import type { JSX } from 'solid-js';

import ChatsPage from '../page';

export default function ChatDetailMobilePage(): JSX.Element {
  const navigate = useNavigate();

  return <ChatsPage layout="mobile" onBack={() => navigate('/chats')} />;
}
