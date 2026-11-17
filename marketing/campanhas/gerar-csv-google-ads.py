"""Gera o CSV de importação do Google Ads Editor a partir de google-ads-lancamento.json.
Uso: python3 gerar-csv-google-ads.py  ->  google-ads-lancamento.csv
Tudo sai PAUSADO. Importar: Google Ads Editor > Conta > Importar > De arquivo (ou colar)."""
import csv, json, pathlib

aqui = pathlib.Path(__file__).parent
d = json.loads((aqui / "google-ads-lancamento.json").read_text(encoding="utf-8"))
cols = ["Campaign", "Campaign Type", "Networks", "Budget", "Budget type", "Bid Strategy Type",
        "Campaign Status", "Languages", "Ad Schedule", "Ad Group", "Max CPC", "Ad Group Status",
        "Keyword", "Criterion Type", "Status", "Location", "Radius", "Unit"] + \
       [f"Headline {i}" for i in range(1, 16)] + [f"Description {i}" for i in range(1, 5)] + \
       ["Path 1", "Path 2", "Final URL", "Callout text", "Ad type"]
geo = d["geo"]
agenda = "(Monday[07:00-21:00]);(Tuesday[07:00-21:00]);(Wednesday[07:00-21:00]);(Thursday[07:00-21:00]);(Friday[07:00-21:00]);(Saturday[07:00-21:00])"
linhas = []
def L(**k): linhas.append({c: k.get(c, "") for c in cols})
for c in d["campanhas"]:
    n, g = c["nome"], c["nome"].split("·")[-1].strip()
    L(Campaign=n, **{"Campaign Type": "Search", "Networks": "Google search", "Budget": c["orcamento_dia"],
      "Budget type": "Daily", "Bid Strategy Type": "Manual CPC", "Campaign Status": "Paused",
      "Languages": "pt", "Ad Schedule": agenda})
    for r in c["raios"]:
        p = geo[r["local"]]
        L(Campaign=n, Location=f"({p['lat']}, {p['lng']})", Radius=r["km"], Unit="km")
    L(Campaign=n, **{"Ad Group": g, "Max CPC": c["cpc_max"], "Ad Group Status": "Enabled"})
    for kw, tipo in c["palavras"]:
        L(Campaign=n, **{"Ad Group": g, "Keyword": kw, "Criterion Type": tipo.capitalize(), "Status": "Enabled"})
    for neg in c["negativas"] + d["negativas_comuns"]:
        L(Campaign=n, **{"Keyword": neg, "Criterion Type": "Campaign Negative Phrase"})
    ad = {"Campaign": n, "Ad Group": g, "Ad type": "Responsive search ad", "Status": "Enabled",
          "Path 1": c["caminho"][0], "Path 2": c["caminho"][1], "Final URL": c["url"]}
    ad.update({f"Headline {i+1}": t for i, t in enumerate(c["titulos"])})
    ad.update({f"Description {i+1}": t for i, t in enumerate(c["descricoes"])})
    L(**ad)
    for t in c["destaques"]:
        L(Campaign=n, **{"Callout text": t})
with open(aqui / "google-ads-lancamento.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=cols); w.writeheader(); w.writerows(linhas)
print(len(linhas), "linhas")
