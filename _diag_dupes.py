import requests, collections

token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsZW9maWRxa2ltZWFucHVvdGh2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDQ3Njc1MiwiZXhwIjoyMDkwMDUyNzUyfQ.j5ORA0kTEogVuzsDHh3YvneWrZMVKqyFRCkUjo7EF1k"
h = {"apikey": token, "Authorization": f"Bearer {token}"}
r = requests.get(
    "https://yleofidqkimeanpuothv.supabase.co/rest/v1/pauta_audiencias",
    headers=h,
    params={"select": "id,processo,data_audiencia,horario,status,reclamada", "limit": "2000", "order": "processo.asc"},
)
data = r.json()
print(f"Total registros: {len(data)}")

grupos = collections.defaultdict(list)
for row in data:
    key = f"{row['processo']}|{row['data_audiencia']}|{row['horario']}"
    grupos[key].append(row)

dupes = {k: v for k, v in grupos.items() if len(v) > 1}
print(f"Grupos duplicados: {len(dupes)}")
for k, rows in list(dupes.items())[:5]:
    print(f"\n  {k}")
    for row in rows:
        print(f"    id={row['id']} (len={len(row['id'])}) status={row['status']}")

# Conta por comprimento de ID
len_counts = collections.Counter(len(r["id"]) for r in data)
print(f"\nDistribuição de comprimento dos IDs: {dict(len_counts)}")
# adv- + 12 = MD5 antigo; adv- + 8 = FNV novo
print(f"IDs MD5 antigos (len=16): {len_counts.get(16, 0)}")
print(f"IDs FNV novos  (len=12): {len_counts.get(12, 0)}")
