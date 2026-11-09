# Changelog

## 2.0.0: 08/11/2026

- Cálculo refeito: irradiação real do local (NASA POWER), tarifa da distribuidora (ANEEL) e conta
  pela Lei 14.300 (Fio B escalonado, custo mínimo sem cobrança dupla, créditos entre meses).
- Corrigido: a taxa mínima era somada ao custo e descontada da economia; o consumo era elevado ao
  mínimo antes do dimensionamento; faltava a ligação bifásica; tarifa fixa de R$ 1,00/kWh.
- Inversor dimensionado pela potência (kWp), não pelo número de placas.
- Projeção de 25 anos com reajuste da tarifa, perda de geração, manutenção e troca do inversor;
  retorno simples e descontado, TIR e VPL.
- Consumo mês a mês, premissas editáveis, gráficos, modo escuro e link com parâmetros.
- Código separado em módulos, com testes do cálculo e script de atualização dos dados da ANEEL.
- Visual novo: cabeçalho com resumo das fontes, fonte Inter, destaque da economia com barras da
  conta antes e depois, cartões do sistema, tema claro/escuro/automático e animações discretas.
- Premissas em painel lateral, agrupadas (sistema, custos, financeiro, impostos), com explicação,
  valor padrão, aviso de alterada, restauração por campo e contador no formulário. Novas: horizonte
  da análise, ano e custo da troca do inversor.
- Gráficos com dica ao passar o mouse (ou tocar) e aba da conta mês a mês, sem e com o sistema.
- Preços de mercado coletados todo dia (Neosolar, Energia Total, Solar Brasil e, com credenciais,
  Mercado Livre): mediana por loja e média entre lojas para módulos; curva preço × potência para
  inversores. Histórico diário em `data/precos-historico.csv`.
- Escolha da marca dos módulos e do inversor, entre as encontradas nas lojas.
- Composição do investimento (módulos, inversor, estrutura, instalação) e painel de preços por loja.
- Workflow do GitHub Actions atualiza preços e tarifas todo dia e o mapa de municípios todo mês.
- Relatório em PDF (impressão do navegador com layout próprio: cabeçalho, dados informados,
  premissas e tabela ano a ano).
- Link que reproduz a simulação inteira (consumo, distribuidora, tarifa, marcas e premissas).
- Português, inglês e espanhol, com números e datas no formato de cada idioma; acompanha o idioma
  escolhido no portfólio.

## Registro de correções

### GL-03: 01/11/2026

- **GL-03:** adicionados `README.md` e `LICENSE`.
