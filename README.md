# Calculadora Solar

Calculadora web de sistema fotovoltaico, investimento e retorno, publicada em
<https://gmenge.github.io/calculadora-solar/>.

## O que ela faz

A partir do CEP, do tipo de ligação e do consumo (médio ou mês a mês):

- busca a cidade e as coordenadas (BrasilAPI, ViaCEP, IBGE e OpenStreetMap como reserva);
- busca a irradiação solar média de cada mês no local (NASA POWER);
- sugere a distribuidora que atende o município e calcula a tarifa com impostos a partir da tarifa
  homologada pela ANEEL (TE + TUSD, ICMS do estado e PIS/COFINS);
- dimensiona o sistema (kWp, módulos, inversor, área) e estima o investimento com preços de mercado
  coletados todo dia em várias lojas (módulos em R$/Wp, inversores por uma curva preço × potência),
  com escolha da marca dos módulos e do inversor;
- simula a conta mês a mês por 25 anos pela Lei 14.300: Fio B escalonado sobre a energia compensada,
  custo mínimo só quando o consumo da rede fica abaixo dele, créditos de um mês para outro;
- mostra economia, retorno simples e descontado, TIR, VPL e o fluxo ano a ano.

Todas as premissas (desempenho, simultaneidade, preço por Wp, reajuste, taxa de desconto etc.) podem
ser alteradas na tela. O botão "Copiar link" gera uma URL que reproduz a simulação inteira, por exemplo
`?cep=90010000&consumo=400&ligacao=bifasico&mm=Gokin&p_desempenho=0.8&lang=en`; "Baixar relatório em
PDF" usa a impressão do navegador com um layout próprio.

Idiomas: português, inglês e espanhol (`js/i18n.js`, o texto em português é a chave). O idioma fica em
`localStorage["idioma"]`, a mesma chave do portfólio, então o app acompanha a escolha feita lá.

## Estrutura

- `index.html`, `css/estilo.css`: página.
- `js/calculo.js`: dimensionamento, conta e fluxo de caixa (sem DOM).
- `js/dados.js`: CEP, irradiação e leitura dos dados da ANEEL.
- `js/app.js`: formulário e resultados.
- `js/i18n.js`: traduções.
- `data/tarifas.json`, `data/municipios.json`: gerados por `scripts/atualizar_dados.py`.
- `testes/`: testes do cálculo.

## Desenvolvimento

```
python -m http.server 8000      # abrir http://localhost:8000
npm test                        # testes do cálculo (Node 20+)
python scripts/coletar_precos.py                    # coleta os preços (--detalhes grava cada oferta)
python scripts/atualizar_dados.py                   # atualiza as tarifas
python scripts/atualizar_dados.py --gd gd.parquet   # tarifas + municípios (precisa de pyarrow)
```

## Preços de mercado

`scripts/coletar_precos.py` lê só APIs públicas das próprias lojas, respeitando o robots.txt, com uma
requisição por segundo e identificação do robô. Lojas que bloqueiam acesso automatizado ficam de fora.

| Loja | Acesso |
|---|---|
| Neosolar | API GraphQL pública (Magento) |
| Energia Total | API pública da loja (Tray) |
| Solar Brasil | API GraphQL pública (Magento) |
| Mercado Livre | API oficial, só com credenciais (opcional) |

Para cada loja: mediana das ofertas em estoque, sem valores extremos. Módulos: média das medianas das
lojas (cada loja pesa igual); pacotes "kit com N painéis" entram pelo preço unitário. Inversores on-grid:
curva preço = a·kW^b ajustada em todas as ofertas. Marca: mediana dos módulos da marca; nos inversores,
fator da marca em relação à curva. O investimento soma módulos, inversor, estrutura (R$/Wp) e
instalação (% dos equipamentos), todos ajustáveis no app.

O workflow `.github/workflows/atualizar-dados.yml` roda todo dia (preços e tarifas) e no dia 3 de cada
mês (municípios), e faz commit em `data/`. Para incluir o Mercado Livre, crie um app em
<https://developers.mercadolivre.com.br> e cadastre `ML_CLIENT_ID` e `ML_CLIENT_SECRET` em
Settings > Secrets and variables > Actions.

O parquet de municípios é a base
[Relação de empreendimentos de geração distribuída](https://dadosabertos.aneel.gov.br/dataset/relacao-de-empreendimentos-de-geracao-distribuida)
da ANEEL.

Os resultados são estimativas e não substituem o projeto de um engenheiro.

## Licença

Todos os direitos reservados. Veja [LICENSE](LICENSE).
