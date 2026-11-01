# Escrever com revisão na hora

A revisão ao digitar vem ativada. O Trama verifica o bloco em edição, as células de tabelas, os nomes de colunas do Kanban e o campo de prática de tradução. Os quatro dicionários ortográficos já acompanham o pacote: português BR/PT e inglês US/UK. Nenhum download ou conta é necessário para a ortografia.

## Usar os alertas

1. Abra **Revisão ao digitar** na página e escolha o idioma do texto.
2. Escreva normalmente. Ao terminar uma palavra, a verificação é agendada em cerca de 80 ms; se parar no meio da digitação, aguarda cerca de 420 ms. O processamento local acrescenta sua própria duração, sobretudo no primeiro carregamento do dicionário.
3. Um sublinhado vermelho indica possível problema ortográfico. Clique no alerta abaixo do campo para ver substituições e use uma delas para corrigir.
4. O azul indica sugestões de gramática/estilo. A análise é agendada após cerca de 800 ms de pausa e depende do LanguageTool instalado.

O Trama não substitui palavras silenciosamente. **Aceitar esta palavra** permite nomes próprios e termos especializados; a lista é salva neste navegador, por variante de idioma. Ela não faz parte dos backups do grafo. É possível redefini-la e desligar os alertas nas configurações de revisão.

Links, tags, referências, comandos, fórmulas, código e endereços de e-mail ficam protegidos. O limite automático é de 20 mil unidades UTF-16 por campo, e a composição de caracteres é respeitada. Resultados antigos são descartados quando o texto muda; uma correção só se aplica ao texto exato que foi verificado.

## Ativar a gramática local uma vez

No Windows, abra **setup-writing.cmd** na pasta do aplicativo. Ele baixa o servidor LanguageTool e, quando necessário, Java Temurin 21 portátil, sem exigir instalação como administrador ou alterar o Java do sistema.

No Arch, use o pacote do sistema:

```bash
sudo pacman -S --needed languagetool
```

Ou uma instalação portátil na pasta de dados:

```bash
bash setup-writing.sh --portable-java
```

O download verificado nesta versão foi de aproximadamente 240 MiB para LanguageTool e 47 MiB para Java no Windows. Os tamanhos podem mudar. Após instalar, volte a escrever; o status é consultado novamente em até 20 segundos. A primeira análise pode levar alguns segundos para iniciar o Java. Depois o processo permanece disponível enquanto o Trama está aberto.

O destino padrão é `<pasta-de-dados>/writing`, com subpastas `languagetool` e `java`. Para usar outra pasta, defina **TRAMA_WRITING_HOME** com o mesmo caminho no instalador e no aplicativo. `python setup_proofreader.py --directory CAMINHO --portable-java` escolhe um destino para o instalador. `--check` testa uma instalação existente com duas frases fixas, sem baixar arquivos.

O LanguageTool só recebe texto pela conexão local do computador. Não há conta, versão Premium, serviço remoto ou promessa de encontrar todos os erros. Em páginas que misturam idiomas, escolha o idioma principal ou revise os trechos separadamente.

## Dicionário de significados

Clique em **Dicionário**, ou selecione uma palavra no editor e pressione **Alt + Shift + D**. A consulta usa a base incluída: português e a edição completa English Wiktionary (inglês), com classe gramatical e exemplos quando constam na fonte. **Guardar significado** cria um bloco no vocabulário, com a atribuição e o link da fonte; esse conteúdo acompanha os backups do grafo.

Veja [DICTIONARY.md](DICTIONARY.md) para cobertura e licença. As regras ortográficas Hunspell têm suas fontes e licenças em `web/vendor/spelling/SOURCE.md`. Ortografia, definições e tradução são recursos diferentes: uma palavra reconhecida pelo corretor pode não ter verbete na base de significados.

## Verificação

Os dicionários reais das quatro variantes foram testados; no ambiente de desenvolvimento, o brasileiro carregou em aproximadamente meio segundo. O LanguageTool real detectou problemas em português e inglês no Windows. O navegador foi usado para conferir os sublinhados, as sugestões, a substituição e a consulta offline. Instalação e desempenho no Arch ainda dependem de verificação nesse sistema.

Fontes do motor gramatical: [servidor LanguageTool](https://dev.languagetool.org/http-server) e [Eclipse Temurin](https://adoptium.net/temurin/releases/).
