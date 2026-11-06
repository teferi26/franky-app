import type { PartyPost } from './model';

/** Venue screens show at most two messages at once, one when it is long, so the
 * type stays readable from the dance floor. Phones (compact) show one. */
export function groupScreenPosts(posts: PartyPost[], compact = false): PartyPost[][] {
  const groups: PartyPost[][] = [];
  const full = compact ? 1 : 2;
  let group: PartyPost[] = [], capacity = full;
  for (const post of posts) {
    const nextCapacity = compact ? 1 : post.body.length > 140 ? 1 : 2;
    if (group.length >= Math.min(capacity, nextCapacity)) { groups.push(group); group = []; capacity = full; }
    capacity = Math.min(capacity, nextCapacity); group.push(post);
    if (group.length === capacity) { groups.push(group); group = []; capacity = full; }
  }
  if (group.length) groups.push(group);
  return groups;
}
