import { canRetry, keepAmountsTogether, errorCodeOf, exampleAmount, historyForRequest, MAX_QUESTION_LENGTH, type ChatMessage } from '../logic';

const msg = (i: number, role: ChatMessage['role'], text = `m${i}`): ChatMessage => ({ id: String(i), role, text });

describe('assistant (application)', () => {
  it('envoie seulement les derniers échanges, en texte seul', () => {
    const many = Array.from({ length: 30 }, (_, i) => msg(i, i % 2 ? 'assistant' : 'user'));
    const sent = historyForRequest(many);
    expect(sent).toHaveLength(12);
    expect(sent[0]).toEqual({ role: 'user', text: 'm18' });
    expect(Object.keys(sent[0]!)).toEqual(['role', 'text']); // pas d'identifiant local
    expect(historyForRequest([msg(0, 'user'), msg(1, 'assistant', 'x'.repeat(5000))])[1]!.text).toHaveLength(4000);
  });

  it('codes d’erreur du serveur : connus ou générique', () => {
    expect(errorCodeOf('daily_limit')).toBe('daily_limit');
    expect(errorCodeOf('consent_required')).toBe('consent_required');
    expect(errorCodeOf('quelque_chose')).toBe('generic');
    expect(errorCodeOf(undefined)).toBe('generic');
  });

  it('nouvelle tentative proposée seulement quand elle a un sens', () => {
    expect(canRetry('busy')).toBe(true);
    expect(canRetry('network')).toBe(true);
    expect(canRetry('daily_limit')).toBe(false);
    expect(canRetry('refused')).toBe(false);
    expect(canRetry('premium_required')).toBe(false);
  });

  it('montants jamais coupés en fin de ligne', () => {
    expect(keepAmountsTogether('Vous avez dépensé 2 100 DH et 12 500 000 FCFA.')).toBe('Vous avez dépensé 2\u202F100\u00A0DH et 12\u202F500\u202F000\u00A0FCFA.');
    expect(keepAmountsTogether('صرفت 245 د.م.')).toBe('صرفت 245\u00A0د.م.');
    expect(keepAmountsTogether('Le 12 novembre, 3 achats')).toBe('Le 12 novembre, 3 achats');
  });

  it('exemple de prix adapté à la devise ; limite identique au serveur', () => {
    expect(exampleAmount('MAD')).toBe(300_000);
    expect(exampleAmount('XAF')).toBe(15_000_000);
    expect(MAX_QUESTION_LENGTH).toBe(1000);
  });
});
