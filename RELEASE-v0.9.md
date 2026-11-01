# Trama 0.9 — escrita recuperável, vocabulário e backup completo

A versão 0.9 implementa as quatro prioridades: salvar rascunhos de aprendizagem, ampliar o dicionário inglês, sugerir alternativas a partir da escrita e restaurar um backup completo por etapas.

## 1. Rascunhos de aprendizagem

- O campo **Uma frase que seja sua**, dentro de **Aprender a escrever**, grava imediatamente uma cópia no navegador e envia a alteração ao banco local após uma pausa curta.
- Fechar/reabrir a aprendizagem ou recarregar a página recupera o último rascunho com texto. **Retomar um rascunho** permite escolher outras atividades, inclusive consultas do dicionário e correções.
- A interface distingue cópia no navegador, confirmação no computador e falha. **Salvar rascunhos agora** permite tentar novamente.
- Duas janelas que editam o mesmo rascunho preservam versões separadas. Abas duplicadas usam caches independentes. Uma resposta atrasada do dicionário não pode substituir uma atividade aberta depois.
- O salvamento automático não conta como prática concluída. **Guardar minha prática** continua registrando uma tentativa no grafo e sua revisão.
- Os rascunhos entram no novo backup completo. São locais e não são transportados pelos snapshots de notas do Proton; práticas explicitamente guardadas continuam sincronizando com o grafo.

Limites: 12.000 unidades UTF-16 por texto, 2.000 rascunhos e 16 MB no total. O campo separado de exercício do painel de tradução ainda não usa esse mecanismo. [Guia de aprendizagem](LEARNING.md).

## 2. Dicionário inglês ampliado

O pacote substitui o Simple English por dados do **English Wiktionary**, extraídos por Kaikki/Wiktextract e filtrados para inglês. A consulta continua local e offline.

| Medida da base empacotada | Valor |
| --- | ---: |
| Entradas inglesas anteriores | 61.743 |
| Entradas inglesas novas | 1.497.827 |
| Ampliação das entradas inglesas | 24,26 vezes |
| Formas inglesas distintas após normalização | 1.360.430 |
| Sentidos ingleses importados | 1.793.712 |
| Exemplos ingleses da fonte | 770.517 |
| Entradas inglesas com ao menos um exemplo | 292.308 |
| Entradas portuguesas preservadas | 401.459 |
| Tamanho do banco | 493.813.760 bytes, aproximadamente 494 MB |

Essas contagens vêm do arquivo gerado, não de uma estimativa de cobertura. Entradas incluem classes e flexões; não equivalem a palavras únicas. A base não oferece exemplo em todos os verbetes. Foram preservadas classes, fontes, licenças e informações de uso presentes na origem, sem criar exemplos ou definições para preencher lacunas.

A comparação integral das 401.459 entradas portuguesas não encontrou diferenças em palavras, classes, definições e exemplos. Consultas reais verificaram, entre outros termos antes ausentes, `metacognition`, `epistemology`, `idempotent`, `counterfactual`, `cognitive dissonance` e `due diligence`.

A [fonte Kaikki](https://kaikki.org/dictionary/English/) informa que esse endpoint pós-processado será descontinuado. Isso não impede a consulta offline do banco já empacotado, mas o construtor precisará acompanhar futuras mudanças da fonte. Dados derivados mantêm atribuição e CC BY-SA 4.0; [origem e reconstrução](DICTIONARY.md).

## 3. Palavras sugeridas a partir das notas

**Explorar palavras**, na barra de uma página, procura repetições relevantes e opções de vocabulário em português ou inglês. A coleção inicial tem **40 famílias autorais — 20 PT e 20 EN — e 79 alternativas**. Também oferece escolhas opcionais para palavras simples sem exigir repetição.

Cada opção mostra significado, exemplo, observação de uso e como o trecho ficaria. O usuário escolhe uma ocorrência. Ao aceitar, o aplicativo prepara conjuntamente:

1. A substituição daquela ocorrência.
2. Uma entrada em **Meu vocabulário**, com contexto e exemplo.
3. Um cartão em **Aprender a escrever → Revisar**.

Se a gravação falhar, o conjunto fica pendente e pode ser tentado novamente sem duplicar o cartão. Se o texto mudou desde a consulta, a aplicação exige nova consulta. Aceitar uma palavra não é registrado como uma frase própria praticada nem como domínio do vocabulário.

Links, referências, código, fórmulas e endereços protegidos ficam fora das trocas. O convite discreto durante a digitação é opcional, vem desligado e aparece após uma pausa. Não abre a tela nem substitui palavras sozinho.

A análise usa regras e material curado, não compreensão integral do sentido da frase. A lista é finita; repetições sem alternativa cadastrada oferecem consulta ao dicionário. A consulta limita-se a 200 mil caracteres e avisa quando há truncamento. Palavras mais complexas não são automaticamente melhores.

## 4. Backup completo e restauração guiada

Em **Dados e backups → Backup completo e restauração guiada**, um ZIP reúne:

- Notas, hierarquia, links, cartões e práticas guardadas no grafo.
- Anexos registrados e seus metadados.
- Histórico ainda disponível, até 100 revisões.
- Rascunhos de Aprender a escrever.
- Preferências permitidas do navegador: aparência, tamanho, idioma, revisão ao digitar, dicas de vocabulário, palavras aceitas, favoritos e recentes.

Ficam fora credenciais de configuração, sessão do Proton, identidade de outro dispositivo, caminhos locais, executável da CLI, dicionário e motores/modelos instalados. Se alguém escreveu um segredo dentro de uma nota, ele continua sendo conteúdo da nota; não há detector de segredos no texto.

O assistente inspeciona integridade e formato, mostra um resumo e pede confirmação. Antes de substituir o estado, guarda um backup completo anterior com link de recuperação. Mudanças ocorridas após a inspeção invalidam a confirmação. A restauração desliga e desconecta a sincronização até a conferência do usuário.

Limites: 256 MB de conteúdo expandido, ZIP de até 260 MB, 5.000 anexos e 20 MB por anexo. Se o limite for excedido, o aplicativo informa o erro sem omitir conteúdo. O arquivo não tem criptografia ou senha própria. O histórico conserva conteúdos e ordem, com números de revisão ajustados no destino. [Passo a passo de backup](BACKUP.md).

## O que foi realmente testado nesta versão

**Suíte local completa no Windows: 208 testes Python e 180 JavaScript, todos passando, sem testes pulados nessa execução.** Foram acrescentados 71 testes em relação à contagem da 0.8. O arquivo real do dicionário estava presente nos testes locais. A cópia de código no Git não inclui esse arquivo; seus três testes específicos ficam explicitamente pulados no CI sem a base.

Testes automatizados executados cobriram:

- Recuperação de rascunhos, escrita offline, tentativas após falha, alteração durante uma gravação, versões concorrentes, abas com sessão duplicada, armazenamento recusado e recuperação após troca de banco.
- Persistência em SQLite sem alterar a revisão das notas, limites, validação e rotas HTTP locais.
- Detecção PT/EN, palavras repetidas e escolhas opcionais, proteção de marcação, referências e código, substituição de ocorrência, texto desatualizado, deduplicação, agendamento e gravação conjunta de texto/vocabulário/cartão.
- Preservação de emojis nos limites de exemplos e cartões de correção.
- Colisão forçada de identificador de anexo: uma criação recusada não apaga o arquivo preexistente.
- Backup/restauração de notas, anexos, histórico, rascunhos e preferências; exclusão de configurações não permitidas; hashes; ZIP inválido; inspeção desatualizada; falhas simuladas de disco/configuração; rollback e recuperação de interrupção simulada.
- Exportação, inspeção, restauração e download da cópia anterior por HTTP real em loopback, incluindo recusa de origem externa e pedidos inválidos.
- Regressão dos recursos existentes por suas suítes automatizadas.

Também foram executados no navegador, em perfil de teste isolado:

- Digitar e recarregar imediatamente; o texto e a atividade foram recuperados.
- Trocar atividade, fechar e reabrir a aprendizagem, preservando rascunhos distintos.
- Consultar `metacognition` na base nova e recuperar o rascunho dessa atividade após recarregar.
- Aceitar `useful` em uma ocorrência de `good`, conferir a entrada em Meu vocabulário e o cartão de revisão.
- Abrir sugestões no tema escuro e verificar o conteúdo da interface.
- Baixar um backup, criar uma página posterior, inspecionar o ZIP e restaurar. O estado anterior voltou, os três rascunhos foram recuperados e o assistente ofereceu a cópia de segurança da situação substituída. Esse teste visual não tinha anexos; os anexos foram verificados nos testes automatizados de backup e HTTP.

A base nova passou por `integrity_check`, comparação integral do conteúdo português, contagem dos dados e 33 consultas de cobertura. Seu SHA-256 é `b325458eabfb16bd0be4bdd22ab37a705b910e128c06306d90018984ad4f73db`.

## Implementado, mas ainda sem validação real correspondente

- Execução da 0.9 em um Arch Linux real e seu ambiente gráfico.
- Transferência entre um Windows real e um Arch real usando uma conta Proton.
- Login e expiração/revogação de sessão real do Proton nesta versão.
- Transferência de anexo grande, falta de internet e conflito de edição através da infraestrutura real do Proton.
- Interrupção física de energia durante a gravação; os testes automatizados exercitaram falhas controladas, não desligamento físico.
- Desempenho confortável com grafos/históricos próximos dos limites máximos.
- Avaliação pedagógica ampla das 79 alternativas e de textos livres por professores ou usuários de diferentes níveis.

Os motores reais de gramática e tradução não foram reinstalados nem submetidos a uma nova avaliação completa nesta rodada. Seus testes automatizados de integração/contrato continuam passando; isso não equivale a validar a qualidade de cada sugestão ou tradução.

O [checklist de sete passos para Windows e Arch](TESTE-PROTON-0.9.md) inclui login, duas direções, anexo de 15 MiB com SHA-256, trabalho offline, conflito, autenticação expirada/revogada e retomada. A [documentação oficial da CLI Proton](https://proton.me/support/drive-cli) descreve o login pelo navegador e os sistemas suportados; essa documentação não substitui o teste da conta do usuário.

## O que ainda precisa melhorar

1. **Concluir o teste real do Proton** com o checklist, registrar versões e corrigir qualquer incompatibilidade encontrada antes de tratar o fluxo Windows–Arch como validado.
2. **Ampliar a persistência de rascunhos** para o exercício separado de tradução e, se desejado, sincronizar rascunhos entre dispositivos com uma política própria de conflitos.
3. **Evoluir as sugestões de escrita**: mais famílias, revisão pedagógica, expressões e diferenças de registro, sem incentivar palavras difíceis fora de contexto.
4. **Melhorar exemplos do dicionário**: expansão verificável de exemplos e sentidos, com origem/licença preservadas; não inventar que todos os verbetes já têm exemplos.
5. **Escalar o backup**: processamento incremental ou em fluxo, suporte a conjuntos maiores e eventual proteção por senha, mantendo restauração verificável.
6. **Medir desempenho e acessibilidade** em computadores diferentes, fontes maiores, navegação por teclado e leitores de tela.
7. **Continuar aproximando o fluxo do Roam** com base no mapa de cobertura. Ainda não há equivalência integral, colaboração simultânea por caractere, aplicativo móvel, Roam Depot ou todas as extensões Datalog do Roam.

## Histórico documentado que antecede a 0.9

| Versão | Evolução registrada |
| --- | --- |
| 0.6 | Pacotes públicos, notas e blocos conectados, temas opcionais, aprendizagem PT/EN, ortografia e dicionário offline. |
| 0.7 | Sincronização automática opcional, tamanho de texto 80–200%, correções de links, importação e preservação de marcação. |
| 0.8 | Comparação de conflitos, confirmação contra estado desatualizado, horários de transporte separados, retomada após falhas e verificações do conteúdo transferido. |
| 0.9 | As quatro prioridades e verificações descritas neste relatório. |

As etapas anteriores à 0.6 fazem parte da construção inicial, mas não há neste repositório notas de lançamento independentes suficientes para atribuir, com segurança, cada mudança às versões 0.1–0.5. Não foram inventadas datas ou listas de testes para essas etapas.

## Atualizar sem perder as notas

Feche o servidor anterior, preserve a pasta de dados e extraia o pacote 0.9. No Windows, abra `start.cmd`; no Arch, execute `bash start.sh`. Use a mesma pasta de dados que já utilizava. A primeira abertura acrescenta as tabelas necessárias sem substituir o grafo. Depois, crie um backup completo e confira o conteúdo antes de reconectar outro computador.

O uso básico continua exigindo Python 3.10+ e navegador atual. O dicionário vem nos pacotes completos; o ZIP automático de código do GitHub não o inclui. A atualização não exige enviar suas notas a um serviço de IA.

**Fim do relatório completo da versão 0.9.** As limitações e os testes pendentes acima são parte do relatório e não foram omitidos.
