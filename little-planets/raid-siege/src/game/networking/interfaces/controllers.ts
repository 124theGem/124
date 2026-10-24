import type { Command, MatchState } from '../../core/types';
export interface Controller {
  readonly actorId: string;
  sample(state: Readonly<MatchState>): Command;
  reset(): void;
}
/** Future transport adapter. Commands are sequenced; a server validates ownership and tick windows. */
export interface RemoteController extends Controller {
  enqueue(sequence: number, tick: number, command: Command): void;
}
export interface MatchTransport {
  sendCommand(sequence: number, tick: number, command: Command): void;
  onSnapshot(callback: (state: MatchState, acknowledgedSequence: number) => void): () => void;
  disconnect(): void;
}
