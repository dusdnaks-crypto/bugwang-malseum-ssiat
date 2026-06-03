// 부광 말씀씨앗 서버 설정 파일
// 처음에는 로컬 저장 모드입니다.
// Supabase 프로젝트를 만든 뒤 아래 값을 채우고 mode를 "supabase"로 바꾸면 서버 동기화가 켜집니다.

```js
window.MALSEUM_SSIAT_SERVER = {
  mode: "supabase",
  supabaseUrl: "https://pbscswnfhajbaycyiois.supabase.co/rest/v1/",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBic2Nzd25maGFqYmF5Y3lpb2lzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NzY5OTksImV4cCI6MjA5NjA1Mjk5OX0.lDUKZX4SNHBYaYQiATVixHEsgTIq_mTPygfqGElxOec",
  table: "malseum_ssiat_app_state",
  appId: "bugwang-malseum-ssiat"
};
```