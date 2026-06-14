const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = "mjgmcydvjrwbygqclvfj";

const res = await fetch(
  `https://api.supabase.com/v1/projects/${ref}/database/query/read-only`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query:
        "select table_name from information_schema.tables where table_schema = 'public' and table_name in ('scrape_jobs', 'places') order by table_name;",
    }),
  },
);

const data = await res.json();
if (!res.ok) {
  console.error(data);
  process.exit(1);
}

console.log("Tables:", data);
