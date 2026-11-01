# Trama 0.10 — atualizações pela própria aplicação

Esta versão permite baixar atualizações estáveis do repositório GitHub enquanto você usa as notas e aplicar o programa novo na próxima inicialização. A primeira passagem da 0.9.1 ou anterior para a 0.10 continua manual. O fluxo completo está em [UPDATES.md](UPDATES.md).

## O que mudou

- **Painel Atualizações:** mostra a versão em execução, a disponível, o progresso, erros e o horário da consulta. O download automático vem ativado no pacote instalado; pode ser desativado. Há uma primeira verificação após abrir e novas verificações a cada seis horas enquanto o aplicativo estiver em execução.
- **Verificação manual:** procura e baixa a nova versão mesmo quando a opção automática está desligada. Desligar a opção não cancela uma transferência já iniciada nem um pacote já pronto.
- **Aplicação na próxima abertura:** a versão preparada fica numa pasta separada. O lançador confere os arquivos antes de iniciar e mantém a anterior se a nova falhar antes de confirmar seu início. Fechar apenas a aba do navegador não instala a atualização.
- **Salvar e encerrar Trama:** confirma notas e rascunhos desta janela antes de pedir o encerramento. Conflitos, revisão desatualizada ou outra janela sinalizando edição impedem o encerramento pelo painel.
- **Instalação mais completa:** o instalador Arch deixou de depender de uma lista manual que omitia `learning_drafts.py` e `full_backup.py`. Linux e Windows usam a mesma rotina de cópia do programa, incluindo novos módulos e o manifesto da versão. Ela prepara a cópia antes da troca, recupera a anterior em falhas comuns de ativação e recusa substituir pastas com dados pessoais inesperados.
- **Iniciadores:** `start.sh` e `start.cmd` usam o novo lançador, preservam os argumentos e verificam Python 3.10 ou mais recente. O iniciador Windows mantém o código de saída de erro depois da pausa.

## Instalar e preservar seus dados

Use o pacote completo da 0.10 para instalar pela primeira vez ou sair da 0.9.1. Salve as alterações, faça um backup completo, encerre o servidor e extraia o programa novo numa pasta separada. Preserve a pasta de dados e use os mesmos argumentos de `--data-dir` quando aplicáveis. O instalador por usuário continua disponível para Windows e Arch.

As próximas atualizações usam um ZIP menor, somente com o programa e seus recursos. Não baixam novamente o dicionário de significados, nem instalam Python, Java, LanguageTool, modelos de tradução ou Proton Drive CLI. Notas, anexos, rascunhos, credenciais e configurações de sincronização permanecem fora da cópia de código. Cada computador verifica e aplica a própria versão.

## Limites de confiança e recuperação

O download é restrito ao repositório esperado, por HTTPS, com tamanho e SHA-256 conferidos e um manifesto por arquivo. **Não há assinatura independente de distribuição**: essa verificação depende da publicação e da infraestrutura GitHub.

A recuperação automática volta ao programa anterior quando a nova versão não confirma a inicialização. **Ela não desfaz mudanças no banco**, não substitui o backup das notas e não detecta todos os problemas que possam ocorrer depois de uma abertura bem-sucedida. Cópias de desenvolvimento com `.git` não ativam versões baixadas automaticamente.

O Trama continua inspirado no Roam, sem equivalência integral, colaboração simultânea ou todas as suas extensões. A atualização do programa também não comprova o funcionamento de uma conta Proton real.

## Verificação e pendências

Na verificação local dos instaladores e iniciadores no Windows, **9 testes passaram e 3 foram pulados por restrições do ambiente**: inicialização do Git Bash, criação de link simbólico e criação de junction. Entre os casos executados estão a importação do servidor a partir da cópia instalada, inclusão dos módulos antes omitidos, preservação de dados e do estado de atualizações, falhas na preparação e na ativação, e execução real de `start.cmd` numa pasta com espaços preservando argumentos e código de saída.

Na suíte local completa, 267 testes Python foram identificados: **264 passaram e 3 foram pulados** pelas restrições acima. **Os 221 testes JavaScript passaram.** Não houve falhas. As suítes novas do atualizador, lançador, API e painel exercitam cenários com pacotes e respostas controladas; dois casos usam subprocessos reais para confirmar início e término por timeout.

Na interface local, foi conferido o painel, a preferência automática, a busca manual e o botão de encerramento. O servidor encerrou e a nota de teste continuou gravada no banco. A versão disponível nesse teste visual era simulada: esse resultado não é prova de download público ou de ativação de outro pacote.

Foi configurado um trabalho de CI em contêiner Arch Linux, além dos trabalhos de Ubuntu e Windows. **O trabalho Arch ainda não foi executado nesta preparação da versão.** Sua presença no workflow não equivale a um resultado aprovado, nem cobre a integração com um menu gráfico nativo.

Os resultados posteriores de empacotamento, CI e integração com o pacote publicado ficam no arquivo **trama-v0.10-relatorio-completo.txt**, nos anexos da [publicação 0.10](https://github.com/Mentalidade-Hacker/trama/releases/tag/v0.10). Este documento registra a etapa local anterior à publicação, sem antecipar esses resultados.

Permanece necessária a validação da instalação e abertura em um Arch gráfico real e de uma transferência por conta Proton real. O checklist em [TESTE-PROTON-0.10.md](TESTE-PROTON-0.10.md) separa esses passos de testes simulados. O relatório anterior permanece em [RELEASE-v0.9.1.md](RELEASE-v0.9.1.md).
