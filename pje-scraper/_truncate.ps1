$url = "https://yleofidqkimeanpuothv.supabase.co"
$key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsZW9maWRxa2ltZWFucHVvdGh2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDQ3Njc1MiwiZXhwIjoyMDkwMDUyNzUyfQ.j5ORA0kTEogVuzsDHh3YvneWrZMVKqyFRCkUjo7EF1k"
$headers = @{
    "apikey" = $key
    "Authorization" = "Bearer $key"
    "Prefer" = "return=minimal"
}
$resp = Invoke-WebRequest -Method Delete -Uri "$url/rest/v1/pauta_audiencias?id=neq.XXXXXXXXXX" -Headers $headers -UseBasicParsing
Write-Host "HTTP $($resp.StatusCode)"
