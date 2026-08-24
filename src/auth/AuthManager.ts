import type { Session } from '@supabase/supabase-js';
import { db } from '../data/supabase';

export interface Member {
  user_id: string;
  display_name: string;
  color: string;
}

/**
 * Session state for the reading circle.
 *
 * Signing in is not the same as being a member: membership is a row in the
 * `members` table that only an existing member can create. A stranger who
 * signs up gets a valid session and still sees nothing but the shelf art.
 */
export class AuthManager {
  private session: Session | null = null;
  private member: Member | null = null;
  private membersById = new Map<string, Member>();
  private listeners: Array<() => void> = [];

  async init(): Promise<void> {
    const supabase = db();
    if (!supabase) return;

    const { data } = await supabase.auth.getSession();
    this.session = data.session;
    await this.loadMember();

    supabase.auth.onAuthStateChange(async (_event, session) => {
      this.session = session;
      await this.loadMember();
      this.emit();
    });
  }

  private async loadMember(): Promise<void> {
    const supabase = db();
    this.member = null;
    this.membersById.clear();
    if (!supabase || !this.session) return;

    // RLS: this returns rows only if the caller is themselves a member.
    const { data } = await supabase
      .from('members')
      .select('user_id, display_name, color');
    if (!data) return;

    for (const m of data as Member[]) this.membersById.set(m.user_id, m);
    this.member = this.membersById.get(this.session.user.id) ?? null;
  }

  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  get isSignedIn(): boolean {
    return Boolean(this.session);
  }

  /** The only check that should ever gate library content. */
  get isMember(): boolean {
    return Boolean(this.member);
  }

  get userId(): string | null {
    return this.session?.user.id ?? null;
  }

  get me(): Member | null {
    return this.member;
  }

  get accessToken(): string | null {
    return this.session?.access_token ?? null;
  }

  /** Display name + colour for anyone in the circle, for annotation labels. */
  memberFor(userId: string): Member | null {
    return this.membersById.get(userId) ?? null;
  }

  /** Everyone in the circle except the signed-in user — who there is to tag. */
  get others(): Member[] {
    const mine = this.userId;
    return [...this.membersById.values()].filter((m) => m.user_id !== mine);
  }

  async signInWithPassword(email: string, password: string) {
    const supabase = db();
    if (!supabase) throw new Error('Backend not configured');
    return supabase.auth.signInWithPassword({ email, password });
  }

  async sendMagicLink(email: string) {
    const supabase = db();
    if (!supabase) throw new Error('Backend not configured');
    return supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    });
  }

  async signOut(): Promise<void> {
    await db()?.auth.signOut();
  }
}
