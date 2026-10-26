-- 0026: a signed-out caller reaches nothing of 0025 (2026-10-26).
--
-- board_layout_valid and its helpers read no table, but they answered a
-- signed-out caller through the API (Yoonji, in the session: "Revoke
-- execute on board_layout_valid and its helpers from anon and public").
-- Signed in, they stay callable: a row's check constraint and
-- set_board_layout call them as the person writing, and only signed-in
-- people write (RLS).
--
-- Additive: grants only.

revoke execute on function public.board_layout_valid(jsonb) from public, anon;
revoke execute on function public._layout_group(jsonb, text) from public, anon;
revoke execute on function public._layout_number(jsonb, numeric, numeric) from public, anon;
revoke execute on function public._board_layout_merge(jsonb, jsonb) from public, anon;
revoke execute on function public._board_layout_clear(jsonb, text[]) from public, anon;
revoke execute on function public._board_layout_prune(jsonb, text[]) from public, anon;
revoke execute on function public.stamp_board_layout() from public, anon;

grant execute on function public.board_layout_valid(jsonb) to authenticated;
grant execute on function public._layout_group(jsonb, text) to authenticated;
grant execute on function public._layout_number(jsonb, numeric, numeric) to authenticated;
grant execute on function public._board_layout_merge(jsonb, jsonb) to authenticated;
grant execute on function public._board_layout_clear(jsonb, text[]) to authenticated;
grant execute on function public._board_layout_prune(jsonb, text[]) to authenticated;
grant execute on function public.stamp_board_layout() to authenticated;
