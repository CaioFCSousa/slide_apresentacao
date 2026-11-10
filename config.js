/* =====================================================================
   CONFIGURAÇÃO DO CONTROLE REMOTO
   ---------------------------------------------------------------------
   No painel do Supabase: botão "Connect" (ou Project Settings → API Keys)
   Copie a Project URL e a chave publishable (sb_publishable_...) ou a anon.
   Essa chave é pública por natureza — pode ficar no front-end.
   Não é preciso criar tabela nenhuma: só usamos o Realtime (Broadcast).
   ===================================================================== */
window.CONFIG_REMOTO = {
  SUPABASE_URL: "https://SEU-PROJETO.supabase.co",
  SUPABASE_KEY: "SUA_CHAVE_PUBLISHABLE_OU_ANON"
};
