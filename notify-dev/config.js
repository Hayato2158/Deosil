const REPO_BASE = "/Deosil";
const isNotifyDev = location.pathname.startsWith(REPO_BASE + "/notify-dev/");
const BASE = isNotifyDev ? REPO_BASE + "/notify-dev" : REPO_BASE;

window.DEOSIL_ENV = {
    SUPABASE_URL: "https://bllysyzdusuregqlraoi.supabase.co",
    SUPABASE_ANON_KEY: "sb_publishable_lVoteFia8h6EiXwdO7aqiA_Nn365Ewn",
    BASE_PATH: BASE,
};