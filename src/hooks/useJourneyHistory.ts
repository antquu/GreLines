import { useEffect, useState } from 'react';
import {
  getJourneyHistory,
  subscribeJourneyHistory,
  type JourneyHistoryEntry,
} from '../services/journeyHistory';

export function useJourneyHistory(): JourneyHistoryEntry[] {
  const [history, setHistory] = useState<JourneyHistoryEntry[]>(() => getJourneyHistory());

  useEffect(() => subscribeJourneyHistory(() => setHistory(getJourneyHistory())), []);

  return history;
}
