# Trama 0.9.1 — correções de persistência e recuperação

Esta atualização corrige falhas reproduzidas na 0.9 e completa o salvamento automático do exercício de tradução. Foi preparada por quatro agentes, com revisão cruzada. Não representa equivalência integral com o Roam nem validação de uma conta Proton real.

## O que mudou

### 1. A prática de tradução passa a ter rascunho recuperável

O texto digitado em **Traduzir página → Praticar escrita** é preservado no navegador e gravado no banco local. Ao fechar ou recarregar, você pode continuar em **Aprender a escrever → Retomar um rascunho**. O botão **Continuar em Aprender** abre exatamente a mesma tentativa.

O rascunho conserva o texto de origem e a tradução de referência. A recuperação não exige executar o tradutor novamente. Origem, idioma, bloco e referência identificam a atividade; se o conteúdo mudar, a tentativa anterior continua disponível separadamente.

A tentativa aceita até 20.000 unidades UTF-16, inclusive ao guardá-la como prática no grafo. Emojis podem ocupar duas unidades. Cada campo de referência conserva até 12.000 unidades; textos maiores são abreviados sem dividir um emoji e com aviso. A identificação considera os textos completos mesmo quando a referência é abreviada.

Foram corrigidos também casos de concorrência:

- Um campo antigo de Aprender, mantido numa janela fechada, não sobrescreve a tentativa mais recente feita no painel de tradução.
- A resposta inicial do servidor não substitui o texto que você já começou a digitar.
- Um campo deliberadamente esvaziado no banco não reaparece preenchido por uma cópia antiga do navegador.
- Se uma restauração muda o banco durante o salvamento de uma versão em conflito, o app preserva a cópia anterior e não afirma que ela está salva no novo banco.
- Texto arquivado após uma restauração não é gravado novamente de forma automática. Sua recuperação é explícita; uma nova edição preserva também o rascunho que veio do backup.

O salvamento automático continua sendo **local**. Para levar o texto ao outro computador pela sincronização das notas, use **Guardar minha prática**. Isso registra a tentativa no grafo e agenda sua revisão; um rascunho sozinho não concede progresso.

### 2. Vocabulário, hierarquia e textos longos

Corrigimos buscas repetidas que ficavam progressivamente lentas em palavras contínuas, links e comandos aninhados. O scanner mantém a contagem total de ocorrências e guarda somente as primeiras 40 para seleção, reduzindo objetos desnecessários. A consulta continua limitada a 200.000 unidades de texto para análise de palavras.

Cartões de aprendizagem e entradas do vocabulário agora são encontrados também dentro de outros blocos. Indentá-los não deve fazê-los desaparecer da revisão, duplicar a entrada ou reiniciar seu agendamento na próxima aceitação de uma alternativa.

Também foram ajustados cortes de texto nos limites de emojis, a proteção de marcações e o foco do teclado quando a lista é refeita ou uma sugestão é salva. Uma palavra parcialmente cortada no limite da consulta não é oferecida como uma ocorrência completa.

A coleção continua com 40 famílias autorais e 79 alternativas. Não houve expansão artificial da coleção nem mudança da base inglesa nesta correção. O dicionário completo da 0.9 foi mantido: 1.497.827 entradas inglesas e 401.459 portuguesas.

### 3. Restauração mais resistente a falhas

O registro usado para recuperar uma restauração interrompida agora é escrito num arquivo temporário e publicado por troca atômica. Uma interrupção durante essa escrita deixa um temporário ignorado na abertura, em vez de um registro parcial que impede o app de iniciar.

Se a confirmação da gravação da pasta falhar depois da troca, o tratamento de recuperação é executado imediatamente. A falha não deixa um registro pendente capaz de reverter uma configuração posterior ao reiniciar; é possível tentar restaurar de novo na mesma execução.

Se o navegador impedir guardar o aviso de conclusão, o Trama mantém o link e o caminho da cópia anterior visíveis. Você pode baixá-la e então usar **Atualizar e abrir notas restauradas**. O aviso não é perdido por uma recarga automática.

O assistente explica quais rascunhos entram no ZIP. Cópias anteriores mantidas somente no navegador ficam fora; há um botão para conferir e recuperar as que você quer incluir. Esse aviso não bloqueia o backup por causa de duplicatas.

## Testado de verdade nesta rodada

**Suíte completa no Windows: 213 testes Python e 207 JavaScript passaram, sem falhas e sem testes pulados. São 420 testes, 32 a mais que os 388 da 0.9.** A base real do dicionário estava presente. O CI de uma futura publicação é uma execução separada e não está implícito nesse resultado local.

Os testes novos e de regressão executados incluem:

- Rascunho de tradução com 20.000 unidades UTF-16, gravação, recuperação, edição offline, contexto preservado e mudança da origem.
- Resposta atrasada, troca de bloco, campo esvaziado, restauração durante conflito e tentativa arquivada sem regravação automática.
- Integração entre os painéis de tradução e aprendizagem, botão de retomada, captura antes do backup e guarda da prática longa no grafo.
- Cartões e vocabulário indentados, preservação de agendamento, contagem de repetições, limite de ocorrências, marcações e emojis.
- Casos longos que reproduziam lentidão, além de foco de teclado em uma simulação de interface.
- Processo encerrado durante escrita parcial do registro de restauração, falha de troca do arquivo e falha de confirmação da pasta após a troca.
- Recibo de restauração quando o armazenamento do navegador é recusado e aviso de rascunhos arquivados.
- Todas as suítes existentes de notas, sincronização, anexos, backup, dicionário, ortografia e contratos de tradução.

No navegador, em um perfil de dados descartável, foram executados:

1. Abrir a tradução, iniciar uma prática, escrever uma tentativa com emoji e recarregar imediatamente.
2. Desligar o tradutor de teste e retomar o texto em Aprender, preservando original e referência.
3. Revelar a referência, guardar a prática no grafo e conferir o registro de progresso.
4. Recarregar novamente com o código final e confirmar o rascunho salvo.
5. Abrir o assistente, conferir o novo aviso e baixar um backup. O ZIP baixado foi aberto e verificado: continha a tentativa exata, o original e a referência.

O tradutor desse teste visual fornecia respostas controladas. Seu registro confirmou uma única tradução inicial; recuperar e guardar a tentativa não fez nova chamada. Isso comprova o fluxo de persistência, **não a qualidade do motor real de tradução**. As falhas de armazenamento e interrupções foram exercitadas por testes automatizados; não foram reproduzidas visualmente como falhas físicas de hardware.

## O que não foi testado e continua pendente

- Arch Linux real, seu ambiente gráfico e integração com o serviço de credenciais da CLI Proton.
- Sincronização Windows–Arch usando uma conta Proton real, incluindo login, expiração/revogação, anexo grande, trabalho offline e conflito pela infraestrutura da Proton.
- Instalação e avaliação nova dos motores reais de tradução e gramática nesta rodada. Os testes automatizados de contrato passaram, mas não medem a qualidade de todas as frases.
- Corte físico de energia durante gravação. O teste de processo encerrado e as falhas controladas não equivalem a esse cenário.
- Desempenho de todo o aplicativo com grafos no limite de tamanho, máquinas variadas ou milhares de cartões de estudo.
- Avaliação completa por leitor de tela, diferentes níveis de zoom e revisão pedagógica das sugestões por professores.
- Execução dos pacotes Linux em Arch real. Teste local e eventual CI Ubuntu não substituem essa verificação.

## Limitações preservadas e próximas melhorias

1. **Validar o Proton real primeiro.** O transporte não recebeu alterações nesta correção. Use o checklist abaixo e registre o que passou, falhou ou não foi executado.
2. **Rascunhos não sincronizam automaticamente entre computadores.** O backup completo os transporta; uma prática explicitamente guardada entra no grafo sincronizado. Sincronização própria de rascunhos exige outra política de conflitos.
3. **Backup mantém seus limites.** Até 256 MB de conteúdo expandido, ZIP de até 260 MB, 5.000 anexos, 20 MB por anexo e até 100 revisões disponíveis. Não há senha própria ou processamento incremental.
4. **Um registro já truncado pela 0.9 não é reparado por adivinhação.** Esta correção evita novos registros parciais. Se o arquivo de recuperação antigo já estiver danificado, preserve dados e cópias anteriores para análise manual.
5. **A coleção de alternativas é finita.** Expandir famílias, expressões, registro e exemplos precisa de revisão contextual e pedagógica. Palavra mais difícil não significa escrita melhor.
6. **Nem todos os verbetes têm exemplos.** A base foi preservada com sua origem e licenças; não foram criados exemplos atribuídos falsamente ao dicionário.
7. **O Trama ainda não tem tudo do Roam.** Permanecem diferenças, como colaboração simultânea por caractere, aplicativo móvel, Roam Depot e partes das extensões Datalog. Consulte [FEATURE-COVERAGE.md](FEATURE-COVERAGE.md).

## Checklist curto para Proton entre Windows e Arch reais

Use a mesma versão nos dois computadores, grafos de teste vazios e uma pasta remota exclusiva. Guarde um backup das suas notas reais antes de começar.

1. **Login:** entre na mesma conta Proton nas duas máquinas, configure Proton direto e a mesma pasta remota; ative a sincronização automática.
2. **Duas direções:** crie nota, bloco filho e link no Windows e confira no Arch; depois faça o caminho inverso.
3. **Anexo grande:** envie um arquivo de 15 MiB, baixe no outro computador e compare tamanho e SHA-256.
4. **Offline:** desconecte a internet, escreva, reconecte e use Verificar agora; confira que o texto permaneceu local e chegou ao outro computador.
5. **Conflito:** desconecte ambas as máquinas, edite o mesmo bloco de formas diferentes e reconecte; compare e preserve as duas versões antes de escolher.
6. **Sessão expirada:** observe uma expiração real ou revogue uma sessão de teste identificada; confira o aviso, entre novamente e retome. Marque simulação como simulação.
7. **Reinício:** encerre durante uma transferência, reabra a mesma pasta de teste e confira retomada e integridade. Registre versões e aprovação, falha ou não executado em cada passo.

O roteiro detalhado está em [TESTE-PROTON-0.9.1.md](TESTE-PROTON-0.9.1.md). Nenhum passo desse checklist foi declarado como executado numa conta real.

## Atualizar e histórico

Crie e confira um backup completo na versão atual. Feche o servidor, extraia a 0.9.1 numa pasta de programa nova e preserve a pasta de dados utilizada. No Windows, use `start.cmd`; no Arch, `bash start.sh`, ou a mesma configuração de `--data-dir` que já usa. Confira as notas antes de reconectar a sincronização.

O formato do grafo e do backup completo foi mantido. Uma versão anterior pode não aceitar tentativas novas com mais de 12.000 unidades; preserve o backup anterior se precisar voltar. O programa exige Python 3.10+ e navegador atual. Os pacotes completos incluem o dicionário; o arquivo automático de código do GitHub não inclui essa base.

| Versão | Evolução documentada |
| --- | --- |
| 0.6 | Distribuição pública, notas e blocos conectados, temas, aprendizagem e dicionário local. |
| 0.7 | Sincronização automática opcional, ajuste de fontes e correções de links/importação. |
| 0.8 | Comparação de conflitos, retomada e verificação do conteúdo transferido. |
| 0.9 | Rascunhos de Aprender, dicionário inglês completo, sugestões e backup guiado. |
| 0.9.1 | Persistência da prática de tradução e correções de rascunhos, hierarquia, desempenho e restauração descritas aqui. |

O relatório anterior continua disponível em [RELEASE-v0.9.md](RELEASE-v0.9.md). Não foram inventadas notas independentes para as etapas 0.1–0.5.

**Fim do relatório completo da versão 0.9.1.** As limitações e verificações pendentes acima fazem parte da entrega.
