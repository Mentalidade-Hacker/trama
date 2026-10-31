/** Authored offline practice: paired concepts, not interchangeable-synonym lists. */
const PAIRS = [
  {
    pt: {word: 'clareza', partOfSpeech: 'substantivo feminino', meaning: 'Qualidade de uma ideia ou explicação que pode ser compreendida sem esforço desnecessário.',
      usage: 'Na escrita, clareza depende da organização das ideias e de referências fáceis de identificar; não exige frases sempre curtas.',
      alternatives: [['nitidez', 'Destaca contornos ou uma percepção bem definida; também pode ser usada em sentido figurado.'], ['transparência', 'Destaca a abertura sobre critérios, decisões ou informações.']],
      prompt: 'Explique em duas frases como organizar uma tarefa cotidiana. Verifique se alguém conseguiria seguir suas instruções.',
      cloze: 'Para que o leitor entenda as instruções sem adivinhar, precisamos de mais ___.', distractors: ['pressa', 'hesitação', 'ruído'], reason: 'Clareza destaca a facilidade de compreensão; as outras opções não expressam esse objetivo.'},
    en: {word: 'clarity', partOfSpeech: 'noun', meaning: 'The quality of being easy to understand, see, or recognize.',
      usage: 'In writing, clarity comes from well-organized ideas and clear references. A longer sentence can still have clarity.',
      alternatives: [['precision', 'Emphasizes exact detail rather than ease of understanding.'], ['transparency', 'Emphasizes openness about information or decisions.']],
      prompt: 'Explain how to organize an everyday task in two sentences. Make each instruction easy for another person to follow.',
      cloze: 'To help readers understand the instructions without guessing, we need greater ___.', distractors: ['haste', 'hesitation', 'noise'], reason: 'Clarity names the ease of understanding that the instructions need.'},
    examples: [['A clareza das instruções evitou dúvidas.', 'The clarity of the instructions prevented confusion.'], ['Reescrevi o parágrafo para dar mais clareza à ideia principal.', 'I rewrote the paragraph to give the main idea greater clarity.']]
  },
  {
    pt: {word: 'conciso', partOfSpeech: 'adjetivo', meaning: 'Que expressa o necessário com poucas palavras, sem perder informações importantes.',
      usage: 'Um texto conciso elimina repetições dispensáveis, mas conserva o contexto de que o leitor precisa.',
      alternatives: [['breve', 'Destaca a pouca extensão ou duração, sem garantir que a informação esteja completa.'], ['sucinto', 'Também indica poucas palavras e costuma aparecer em pedidos de resumos ou relatos.']],
      prompt: 'Escreva um aviso de três frases e depois reduza-o a duas, preservando prazo, ação e responsável.',
      cloze: 'O resumo é ___: usa poucas palavras e preserva os pontos essenciais.', distractors: ['interminável', 'confuso', 'repetitivo'], reason: 'Conciso combina economia de palavras com preservação do que importa.'},
    en: {word: 'concise', partOfSpeech: 'adjective', meaning: 'Giving the necessary information clearly in few words.',
      usage: 'Concise writing removes unnecessary repetition, not the context a reader needs.',
      alternatives: [['brief', 'Emphasizes short length or duration, without necessarily implying completeness.'], ['succinct', 'Emphasizes compact, clear expression and is often used for explanations or summaries.']],
      prompt: 'Write a three-sentence announcement, then reduce it to two sentences while keeping the action, deadline, and responsible person.',
      cloze: 'The summary is ___: it uses few words while retaining the essential points.', distractors: ['endless', 'confusing', 'repetitive'], reason: 'Concise describes economical wording that still communicates the necessary information.'},
    examples: [['O relatório é conciso, mas apresenta todos os resultados.', 'The report is concise but presents all the results.'], ['Prefiro um aviso conciso a uma longa lista de repetições.', 'I prefer a concise announcement to a long list of repetitions.']]
  },
  {
    pt: {word: 'nuance', partOfSpeech: 'substantivo feminino', meaning: 'Diferença sutil de sentido, tom ou intensidade.',
      usage: 'Use nuance quando uma diferença pequena for relevante para a interpretação, não apenas para dizer que há muitos detalhes.',
      alternatives: [['sutileza', 'Pode destacar algo delicado ou difícil de perceber, sem envolver uma diferença entre sentidos.'], ['distinção', 'Indica uma diferença identificável, que pode ser grande ou pequena.']],
      prompt: 'Compare “possível” e “provável” em duas frases e explique a nuance que muda a expectativa do leitor.',
      cloze: 'Entre “possível” e “provável”, há uma ___ de sentido que altera o grau de certeza.', distractors: ['certeza', 'contradição total', 'repetição literal'], reason: 'Nuance expressa a diferença sutil entre os graus de possibilidade, sem tratar as palavras como opostas.'},
    en: {word: 'nuance', partOfSpeech: 'noun', meaning: 'A subtle difference in meaning, tone, or degree.',
      usage: 'Use nuance for a small difference that matters to interpretation, not as a general label for any detail.',
      alternatives: [['subtlety', 'Emphasizes something delicate or difficult to notice.'], ['distinction', 'Names a difference that may be either subtle or obvious.']],
      prompt: 'Compare “possible” and “probable” in two sentences, and explain how the nuance changes the reader’s expectations.',
      cloze: 'There is a ___ between “possible” and “probable” that changes the level of certainty.', distractors: ['guarantee', 'complete contradiction', 'literal repetition'], reason: 'Nuance identifies a subtle difference in degree without suggesting that the words are opposites.'},
    examples: [['Uma pequena nuance de tom mudou a interpretação da mensagem.', 'A slight nuance of tone changed the interpretation of the message.'], ['A tradução preserva a nuance de incerteza do original.', 'The translation preserves the nuance of uncertainty in the original.']]
  },
  {
    pt: {word: 'coerente', partOfSpeech: 'adjetivo', meaning: 'Cujas partes se relacionam de modo lógico e não se contradizem.',
      usage: 'Um argumento coerente mantém uma relação compreensível entre suas ideias; ainda precisa de evidências para ser convincente.',
      alternatives: [['coeso', 'Na análise de textos, destaca os recursos que conectam frases e partes do texto.'], ['consistente', 'Pode destacar estabilidade entre situações ou solidez de um argumento.']],
      prompt: 'Escreva uma opinião, um motivo e uma conclusão. Confira se a conclusão decorre do motivo apresentado.',
      cloze: 'O argumento é ___: a conclusão se liga às razões apresentadas, sem contradição.', distractors: ['contraditório', 'aleatório', 'incompreensível'], reason: 'Coerente descreve a relação lógica entre as partes de um argumento.'},
    en: {word: 'coherent', partOfSpeech: 'adjective', meaning: 'Organized in a logical, connected way that is understandable.',
      usage: 'A coherent argument connects its ideas logically. Coherence alone does not establish that its claims are true.',
      alternatives: [['cohesive', 'Emphasizes how parts are held together, including connections within a text.'], ['consistent', 'Emphasizes the absence of conflicting behavior, statements, or standards.']],
      prompt: 'Write an opinion, a reason, and a conclusion. Check that the conclusion follows from the reason you gave.',
      cloze: 'The argument is ___: its conclusion connects logically to its reasons.', distractors: ['contradictory', 'random', 'incomprehensible'], reason: 'Coherent describes ideas that form an understandable, logically connected whole.'},
    examples: [['O texto ficou mais coerente depois que reorganizamos os argumentos.', 'The text became more coherent after we reorganized the arguments.'], ['Ela apresentou um plano coerente com os objetivos da equipe.', 'She presented a plan that was coherent and aligned with the team’s goals.']]
  },
  {
    pt: {word: 'ressalva', partOfSpeech: 'substantivo feminino', meaning: 'Observação que limita, condiciona ou faz uma exceção a uma afirmação.',
      usage: 'Uma ressalva pode acompanhar uma concordância parcial. Explicite qual parte da afirmação ela limita.',
      alternatives: [['restrição', 'Destaca um limite imposto a algo, sem necessariamente ser uma observação no texto.'], ['advertência', 'Destaca um aviso sobre risco ou problema.']],
      prompt: 'Recomende uma ferramenta cotidiana e acrescente uma ressalva específica sobre quando ela não ajuda.',
      cloze: 'Concordo com a proposta, com uma ___: o prazo precisa ser revisto.', distractors: ['certeza absoluta', 'repetição', 'digressão sem relação'], reason: 'Ressalva introduz a condição que limita a concordância com a proposta.'},
    en: {word: 'caveat', partOfSpeech: 'noun', meaning: 'A qualification or warning that limits how a statement or recommendation should be understood.',
      usage: 'A caveat identifies an important limitation. State the limitation directly instead of merely announcing that one exists.',
      alternatives: [['qualification', 'Emphasizes a modification that limits a statement’s scope.'], ['warning', 'Emphasizes a possible danger or undesirable outcome.']],
      prompt: 'Recommend an everyday tool and add one specific caveat about a situation where it would not help.',
      cloze: 'I support the proposal, with one ___: the deadline needs to be revised.', distractors: ['absolute guarantee', 'repetition', 'unrelated digression'], reason: 'Caveat introduces the limitation attached to the speaker’s support.'},
    examples: [['Aceitei a sugestão com uma ressalva sobre o prazo.', 'I accepted the suggestion with a caveat about the deadline.'], ['O relatório inclui uma ressalva sobre o tamanho da amostra.', 'The report includes a caveat about the sample size.']]
  },
  {
    pt: {word: 'preciso', partOfSpeech: 'adjetivo', meaning: 'Que identifica algo com exatidão, evitando limites ou informações vagos.',
      usage: 'Nesta lição, preciso é adjetivo, não a forma verbal de precisar. Um horário preciso informa mais que “mais tarde”.',
      alternatives: [['exato', 'Destaca correspondência rigorosa com um valor ou fato.'], ['específico', 'Destaca um caso ou detalhe particular, sem garantir exatidão.']],
      prompt: 'Substitua “em breve” e “algumas pessoas” por informações precisas em um aviso inventado.',
      cloze: 'Em vez de “depois do almoço”, indique um horário ___, como 14h30.', distractors: ['vago', 'indefinido', 'incerto'], reason: 'Preciso indica que o horário deve ser determinado com exatidão.'},
    en: {word: 'precise', partOfSpeech: 'adjective', meaning: 'Exact and carefully defined rather than vague.',
      usage: 'Precise wording states the detail or limit the reader needs. It does not require unnecessarily technical vocabulary.',
      alternatives: [['exact', 'Emphasizes a strict match with a value, fact, or description.'], ['specific', 'Emphasizes a particular detail or case, not necessarily its accuracy.']],
      prompt: 'Replace “soon” and “some people” with precise information in an announcement you invent.',
      cloze: 'Instead of “after lunch,” give a ___ time, such as 2:30 p.m.', distractors: ['vague', 'undefined', 'uncertain'], reason: 'Precise indicates that the time should be stated exactly rather than vaguely.'},
    examples: [['O manual usa um termo preciso para cada peça.', 'The manual uses a precise term for each part.'], ['Precisamos de um horário preciso para organizar a entrega.', 'We need a precise time to organize the delivery.']]
  },
  {
    pt: {word: 'relevante', partOfSpeech: 'adjetivo', meaning: 'Que tem importância para o assunto, a decisão ou o objetivo em questão.',
      usage: 'Explique para que algo é relevante. Uma informação interessante pode não ajudar a responder à pergunta do texto.',
      alternatives: [['pertinente', 'Destaca a relação direta ou a adequação ao assunto.'], ['importante', 'Destaca valor ou impacto, mesmo sem ligação com o assunto atual.']],
      prompt: 'Escolha um objetivo para uma mensagem e liste uma informação relevante e outra dispensável para esse objetivo.',
      cloze: 'Inclua apenas a informação ___ para decidir o próximo passo; deixe os detalhes sem relação para outro texto.', distractors: ['alheia', 'irrelevante', 'desconectada'], reason: 'Relevante liga a informação ao objetivo concreto de tomar uma decisão.'},
    en: {word: 'relevant', partOfSpeech: 'adjective', meaning: 'Connected to the matter being considered in a way that helps address it.',
      usage: 'Say what something is relevant to. Interesting information may still be irrelevant to the question a text addresses.',
      alternatives: [['pertinent', 'Often emphasizes direct applicability to a particular issue.'], ['important', 'Emphasizes significance or impact, which may be unrelated to the current topic.']],
      prompt: 'Choose a purpose for a message. List one detail relevant to that purpose and one detail that could be omitted.',
      cloze: 'Include only information ___ to the decision; save unrelated details for another document.', distractors: ['unrelated', 'irrelevant', 'extraneous'], reason: 'Relevant connects the information to the particular decision under discussion.'},
    examples: [['A experiência anterior é relevante para esta escolha.', 'Previous experience is relevant to this choice.'], ['Retirei um detalhe que não era relevante para a pergunta.', 'I removed a detail that was not relevant to the question.']]
  },
  {
    pt: {word: 'ambíguo', partOfSpeech: 'adjetivo', meaning: 'Que admite duas ou mais interpretações.',
      usage: 'Um trecho ambíguo nem sempre é inadequado: pode servir ao humor ou à literatura. Em instruções, geralmente convém esclarecer o sentido.',
      alternatives: [['vago', 'Fornece poucos detalhes ou limites, mesmo sem admitir duas interpretações definidas.'], ['equívoco', 'Como adjetivo, pode indicar sentido duvidoso; como substantivo, costuma significar engano.']],
      prompt: 'Invente uma frase com “ele” que possa se referir a duas pessoas. Depois, substitua o pronome pelo nome correto.',
      cloze: 'O pronome torna o trecho ___, pois pode se referir a duas pessoas diferentes.', distractors: ['inequívoco', 'unívoco', 'explícito'], reason: 'Ambíguo indica que o trecho permite mais de uma interpretação.'},
    en: {word: 'ambiguous', partOfSpeech: 'adjective', meaning: 'Open to two or more interpretations.',
      usage: 'Ambiguity can be intentional in humor or literature. In instructions, identify the intended meaning whenever confusion would matter.',
      alternatives: [['vague', 'Lacks clear detail or limits without necessarily offering two distinct meanings.'], ['unclear', 'Broadly describes difficulty understanding something, for several possible reasons.']],
      prompt: 'Write a sentence in which “she” could refer to two people. Rewrite it using the intended person’s name.',
      cloze: 'The pronoun makes the sentence ___ because it could refer to either of two people.', distractors: ['unambiguous', 'unequivocal', 'explicit'], reason: 'Ambiguous identifies the presence of more than one possible interpretation.'},
    examples: [['O aviso é ambíguo: não sabemos qual porta deve ficar aberta.', 'The notice is ambiguous: we do not know which door should remain open.'], ['Substituí o pronome para evitar um trecho ambíguo.', 'I replaced the pronoun to avoid an ambiguous passage.']]
  },
  {
    pt: {word: 'evidência', partOfSpeech: 'substantivo feminino', meaning: 'Informação ou observação que serve de apoio à avaliação de uma afirmação.',
      usage: 'Uma evidência pode ser mais ou menos forte; sua presença não transforma automaticamente uma conclusão em certeza.',
      alternatives: [['indício', 'Costuma indicar um sinal que sugere algo e pode exigir confirmação.'], ['prova', 'Pode sugerir demonstração mais conclusiva; o sentido exato depende do contexto.']],
      prompt: 'Escreva uma afirmação sobre um hábito de estudo e diga qual evidência você precisaria observar para avaliá-la.',
      cloze: 'Para sustentar a afirmação, apresente uma ___ observável, não apenas uma preferência pessoal.', distractors: ['suposição sem apoio', 'preferência', 'impressão não verificada'], reason: 'Evidência é um apoio que pode ser examinado; preferência e suposição não cumprem esse papel por si sós.'},
    en: {word: 'evidence', partOfSpeech: 'uncountable noun', meaning: 'Information or observations used to assess whether a claim is supported.',
      usage: 'Evidence is normally uncountable: use “some evidence” or “a piece of evidence,” not “an evidence.” Its strength can vary.',
      alternatives: [['indication', 'Often suggests a sign pointing toward a possibility.'], ['proof', 'Usually suggests stronger or conclusive support, depending on the context.']],
      prompt: 'Make a claim about a study habit and describe the evidence you would need to evaluate it.',
      cloze: 'To support the claim, present observable ___ rather than personal preference alone.', distractors: ['guesswork', 'preference', 'speculation'], reason: 'Evidence provides information that others can assess; guesswork and preference alone do not.'},
    examples: [['Encontramos evidência de que o novo horário reduziu os atrasos.', 'We found evidence that the new schedule reduced delays.'], ['Uma opinião não substitui a evidência apresentada no relatório.', 'An opinion does not replace the evidence presented in the report.']]
  },
  {
    pt: {word: 'inferir', partOfSpeech: 'verbo', meaning: 'Chegar a uma conclusão a partir de sinais, informações ou premissas.',
      usage: 'Inferir descreve o que o leitor ou observador conclui. A conclusão pode ser razoável sem ser certa.',
      alternatives: [['deduzir', 'Pode indicar uma conclusão que decorre de premissas; no uso cotidiano também é usado de modo mais amplo.'], ['supor', 'Admite algo como possível ou verdadeiro, às vezes com menos apoio explícito.']],
      prompt: 'Descreva dois sinais de que uma biblioteca está prestes a fechar e escreva o que você pode inferir deles.',
      cloze: 'Ao reunir os sinais disponíveis, podemos ___ que a reunião terminou, embora ninguém tenha confirmado.', distractors: ['garantir', 'decretar', 'ordenar'], reason: 'Inferir expressa uma conclusão baseada em sinais, preservando a possibilidade de erro.'},
    en: {word: 'infer', partOfSpeech: 'verb', meaning: 'To reach a conclusion from information or signs rather than from an explicit statement.',
      usage: 'Readers infer a meaning; speakers or texts may imply it. An inference can be reasonable without being certain.',
      alternatives: [['deduce', 'Often emphasizes reasoning from stated premises or facts.'], ['assume', 'Treats something as true, sometimes without sufficient evidence.']],
      prompt: 'Describe two signs that a library is about to close, then state what you can infer from them.',
      cloze: 'From the available signs, we can ___ that the meeting has ended, although no one has confirmed it.', distractors: ['guarantee', 'decree', 'command'], reason: 'Infer means to draw a conclusion from signs; it does not imply direct confirmation.'},
    examples: [['Podemos inferir pelo silêncio que todos saíram, mas precisamos confirmar.', 'We can infer from the silence that everyone has left, but we need to confirm it.'], ['Não é possível inferir a intenção da autora apenas pelo título.', 'It is not possible to infer the author’s intention from the title alone.']]
  },
  {
    pt: {word: 'sintetizar', partOfSpeech: 'verbo', meaning: 'Reunir ideias ou informações em uma apresentação integrada de seus pontos principais.',
      usage: 'Sintetizar vai além de cortar palavras: pode exigir combinar fontes, identificar relações e preservar diferenças importantes.',
      alternatives: [['resumir', 'Destaca a redução de um texto ou relato aos seus pontos principais.'], ['integrar', 'Destaca a reunião de partes em um conjunto, sem exigir redução.']],
      prompt: 'Escreva duas opiniões diferentes sobre estudar com música. Depois, sintetize a discussão em duas frases.',
      cloze: 'O desafio é ___ os resultados de três estudos em uma visão integrada, preservando suas diferenças.', distractors: ['fragmentar', 'repetir literalmente', 'omitir'], reason: 'Sintetizar reúne os resultados em uma apresentação integrada, sem exigir que as diferenças desapareçam.'},
    en: {word: 'synthesize', partOfSpeech: 'verb', meaning: 'To combine ideas or information into an integrated account or understanding.',
      usage: 'To synthesize sources, connect their ideas and explain important differences. Simply listing quotations is not enough.',
      alternatives: [['summarize', 'Emphasizes presenting the main points in a shorter form.'], ['integrate', 'Emphasizes bringing parts together, without necessarily making them shorter.']],
      prompt: 'Write two different opinions about studying with music. Then synthesize the discussion in two sentences.',
      cloze: 'The task is to ___ the findings of three studies into an integrated account while preserving their differences.', distractors: ['fragment', 'repeat verbatim', 'omit'], reason: 'Synthesize means to bring the findings together into a connected account.'},
    examples: [['Vou sintetizar as sugestões antes de apresentar o plano.', 'I will synthesize the suggestions before presenting the plan.'], ['O texto procura sintetizar diferentes perspectivas sobre o mesmo problema.', 'The text seeks to synthesize different perspectives on the same problem.']]
  },
  {
    pt: {word: 'contrastar', partOfSpeech: 'verbo', meaning: 'Comparar elementos de modo a destacar suas diferenças.',
      usage: 'Ao contrastar opções, use critérios comparáveis. Comparar pode destacar semelhanças e diferenças; contrastar enfatiza diferenças.',
      alternatives: [['comparar', 'Examina relações entre elementos, incluindo semelhanças.'], ['diferenciar', 'Identifica ou estabelece o que distingue elementos.']],
      prompt: 'Contraste estudar sozinho e estudar em grupo usando os mesmos dois critérios.',
      cloze: 'Para destacar as diferenças entre os métodos, vamos ___ seus resultados usando o mesmo critério.', distractors: ['igualar', 'ocultar', 'confundir'], reason: 'Contrastar põe os resultados em comparação para evidenciar diferenças.'},
    en: {word: 'contrast', partOfSpeech: 'verb', meaning: 'To compare things in order to highlight differences.',
      usage: 'When you contrast options, use comparable criteria. Compare can cover similarities and differences; contrast emphasizes differences.',
      alternatives: [['compare', 'Examines relationships, including similarities as well as differences.'], ['differentiate', 'Identifies or establishes what makes things distinct.']],
      prompt: 'Contrast studying alone and studying in a group using the same two criteria.',
      cloze: 'To highlight differences between the methods, we will ___ their results using the same criterion.', distractors: ['equalize', 'conceal', 'confuse'], reason: 'Contrast means to compare in a way that brings out differences.'},
    examples: [['O artigo vai contrastar as duas propostas.', 'The article will contrast the two proposals.'], ['É útil contrastar as expectativas iniciais com os resultados.', 'It is useful to contrast the initial expectations with the results.']]
  },
  {
    pt: {word: 'fundamentar', partOfSpeech: 'verbo', meaning: 'Dar a uma afirmação ou decisão uma base de razões, informações ou evidências.',
      usage: 'Fundamentar uma opinião exige apresentar seu apoio e explicar como ele se relaciona à conclusão.',
      alternatives: [['justificar', 'Explica as razões de uma ação ou escolha; o contexto pode envolver defesa de uma decisão.'], ['sustentar', 'Pode indicar apoio a uma tese, inclusive ao longo de uma discussão.']],
      prompt: 'Escolha um horário para uma atividade e fundamente sua decisão com duas razões verificáveis.',
      cloze: 'Precisamos ___ a recomendação com dados e razões que o leitor possa examinar.', distractors: ['disfarçar', 'improvisar sem apoio', 'ocultar'], reason: 'Fundamentar significa fornecer uma base que permita avaliar a recomendação.'},
    en: {word: 'substantiate', partOfSpeech: 'verb', meaning: 'To provide evidence or support for a claim.',
      usage: 'Substantiate is relatively formal. Explain what the evidence supports and avoid implying that weak evidence proves a claim.',
      alternatives: [['support', 'A broader and often simpler verb for providing reasons or evidence.'], ['verify', 'Emphasizes checking whether something is true or accurate.']],
      prompt: 'Recommend a time for an activity and describe two pieces of information that would substantiate your recommendation.',
      cloze: 'We need to ___ the recommendation with data and reasons that readers can examine.', distractors: ['disguise', 'invent without support', 'conceal'], reason: 'Substantiate means to provide support for the recommendation, not merely repeat it.'},
    examples: [['Os registros ajudam a fundamentar a conclusão.', 'The records help substantiate the conclusion.'], ['Precisamos fundamentar a afirmação com informações verificáveis.', 'We need to substantiate the claim with verifiable information.']]
  },
  {
    pt: {word: 'ponderar', partOfSpeech: 'verbo', meaning: 'Considerar com cuidado os fatores relevantes antes de julgar ou decidir.',
      usage: 'Ponderar envolve examinar razões ou consequências. Especifique o que está sendo considerado, em vez de apenas pedir reflexão.',
      alternatives: [['avaliar', 'Pode envolver critérios explícitos e a atribuição de valor ou qualidade.'], ['refletir', 'Destaca o ato de pensar com atenção, sem exigir uma escolha entre opções.']],
      prompt: 'Pondere uma vantagem e uma desvantagem de mudar seu horário de estudo antes de recomendar uma opção.',
      cloze: 'Antes de escolher, convém ___ as vantagens e as limitações de cada alternativa.', distractors: ['ignorar', 'apagar', 'inventar'], reason: 'Ponderar indica examinar fatores com cuidado antes da decisão.'},
    en: {word: 'weigh', partOfSpeech: 'verb', meaning: 'To consider the relative importance of factors before making a judgment.',
      usage: 'This figurative sense appears in expressions such as “weigh the options” and “weigh the benefits against the costs.”',
      alternatives: [['evaluate', 'Often emphasizes assessing something against criteria.'], ['consider', 'Broadly means to think about something; it need not involve balancing competing factors.']],
      prompt: 'Weigh one advantage and one disadvantage of changing your study schedule before recommending an option.',
      cloze: 'Before choosing, we should ___ the benefits against the limitations of each option.', distractors: ['ignore', 'erase', 'invent'], reason: 'Weigh describes considering the relative importance of competing factors.'},
    examples: [['Precisamos ponderar os benefícios e as limitações da proposta.', 'We need to weigh the benefits and limitations of the proposal.'], ['Vou ponderar as opções antes de responder.', 'I will weigh the options before answering.']]
  },
  {
    pt: {word: 'pertinente', partOfSpeech: 'adjetivo', meaning: 'Diretamente relacionado ou adequado ao assunto em discussão.',
      usage: 'Pertinente destaca a relação com o assunto. Não significa apenas interessante ou importante em termos gerais.',
      alternatives: [['relevante', 'Enfatiza a importância de uma informação para um objetivo ou questão.'], ['oportuno', 'Destaca a adequação ao momento ou à ocasião.']],
      prompt: 'Imagine uma reunião para organizar uma biblioteca. Escreva uma pergunta pertinente à distribuição das tarefas.',
      cloze: 'A pergunta sobre o prazo é ___ à discussão sobre o cronograma.', distractors: ['alheia', 'estranha', 'irrelevante'], reason: 'Pertinente indica ligação direta entre a pergunta e o assunto discutido.'},
    en: {word: 'pertinent', partOfSpeech: 'adjective', meaning: 'Directly connected to and appropriate for the matter being discussed.',
      usage: 'Pertinent is somewhat formal. It often describes a question, detail, or observation that directly bears on an issue.',
      alternatives: [['relevant', 'A broader, common choice for information connected to a topic or decision.'], ['timely', 'Emphasizes suitability for the moment rather than direct connection to the topic.']],
      prompt: 'Imagine a meeting to organize a library. Write a question pertinent to assigning the tasks.',
      cloze: 'The question about the deadline is ___ to our discussion of the schedule.', distractors: ['unrelated', 'irrelevant', 'extraneous'], reason: 'Pertinent identifies the direct connection between the question and the discussion.'},
    examples: [['Ela fez uma observação pertinente ao tema.', 'She made an observation pertinent to the topic.'], ['A pergunta é pertinente porque ajuda a definir o prazo.', 'The question is pertinent because it helps establish the deadline.']]
  },
  {
    pt: {word: 'consistente', partOfSpeech: 'adjetivo', meaning: 'Que mantém um padrão ou uma relação estável, sem contradições relevantes.',
      usage: 'O sentido depende do contexto: um critério consistente permanece estável; um argumento consistente pode ser sólido. Consistente também descreve textura.',
      alternatives: [['coerente', 'Destaca a relação lógica entre ideias ou ações.'], ['regular', 'Pode destacar frequência ou repetição, sem garantir ausência de contradição.']],
      prompt: 'Escolha uma regra de formatação e explique como aplicá-la de modo consistente em um texto.',
      cloze: 'O critério precisa ser ___: situações equivalentes devem receber o mesmo tratamento.', distractors: ['contraditório', 'arbitrário', 'instável'], reason: 'Consistente indica estabilidade na aplicação do critério a casos equivalentes.'},
    en: {word: 'consistent', partOfSpeech: 'adjective', meaning: 'Following the same standard or showing no important contradictions across cases.',
      usage: 'Consistent can describe repeated practice or compatibility between claims. It does not mean that the practice or claim is necessarily good.',
      alternatives: [['coherent', 'Emphasizes logical connections within a whole.'], ['regular', 'Often emphasizes frequency or a repeated pattern.']],
      prompt: 'Choose a formatting rule and explain how to apply it consistently throughout a document.',
      cloze: 'The criterion must be ___: equivalent situations should receive the same treatment.', distractors: ['contradictory', 'arbitrary', 'unstable'], reason: 'Consistent means applying a stable standard across comparable cases.'},
    examples: [['O uso dos termos deve ser consistente ao longo do texto.', 'The use of terms should be consistent throughout the text.'], ['O resultado é consistente com as observações anteriores.', 'The result is consistent with the previous observations.']]
  },
  {
    pt: {word: 'explícito', partOfSpeech: 'adjetivo', meaning: 'Expresso diretamente, sem depender de dedução para identificar a informação.',
      usage: 'Tornar um pedido explícito ajuda o leitor a reconhecer a ação esperada. Informação explícita ainda pode precisar de contexto.',
      alternatives: [['declarado', 'Destaca que algo foi afirmado ou anunciado.'], ['direto', 'Pode descrever uma forma de expressão sem rodeios, mesmo sem detalhar tudo.']],
      prompt: 'Reescreva “Seria bom resolver isso” com um pedido explícito que indique ação e prazo.',
      cloze: 'O pedido deve ser ___: diga diretamente quem fará a tarefa e até quando.', distractors: ['implícito', 'oculto', 'subentendido'], reason: 'Explícito significa apresentar a informação diretamente, sem depender de subentendidos.'},
    en: {word: 'explicit', partOfSpeech: 'adjective', meaning: 'Stated directly and clearly rather than left for the reader to infer.',
      usage: 'An explicit request identifies the expected action. Being explicit need not mean being impolite or excessively detailed.',
      alternatives: [['stated', 'Emphasizes that something has been expressed.'], ['direct', 'Emphasizes straightforward expression, which may still leave some details unstated.']],
      prompt: 'Rewrite “It would be good to resolve this” as an explicit request with an action and a deadline.',
      cloze: 'Make the request ___: state directly who will do the task and by when.', distractors: ['implicit', 'hidden', 'unspoken'], reason: 'Explicit information is stated rather than left for readers to infer.'},
    examples: [['O convite inclui um pedido explícito de confirmação.', 'The invitation includes an explicit request for confirmation.'], ['Tornei explícito o critério usado na comparação.', 'I made the criterion used in the comparison explicit.']]
  },
  {
    pt: {word: 'implícito', partOfSpeech: 'adjetivo', meaning: 'Sugerido pelo contexto, mas não declarado diretamente.',
      usage: 'Uma informação implícita depende de interpretação. Ao analisá-la, mostre quais pistas sustentam sua leitura.',
      alternatives: [['subentendido', 'Destaca o que se espera que seja compreendido sem declaração direta.'], ['sugerido', 'Pode indicar uma ideia apresentada de forma indireta, sem que ela seja necessária à interpretação.']],
      prompt: 'Escreva uma frase que sugira cansaço sem usar a palavra “cansaço” e explique o sentido implícito.',
      cloze: 'O pedido ficou ___: ninguém o declarou, mas o contexto permitia percebê-lo.', distractors: ['explícito', 'declarado', 'enunciado diretamente'], reason: 'Implícito descreve o sentido percebido pelo contexto sem uma declaração direta.'},
    en: {word: 'implicit', partOfSpeech: 'adjective', meaning: 'Suggested or understood from context without being directly stated.',
      usage: 'An implicit meaning requires interpretation. Explain which clues support your reading instead of treating it as a direct quotation.',
      alternatives: [['unstated', 'Simply says that something was not expressed; it may or may not be understood.'], ['implied', 'Emphasizes that a meaning is suggested without being directly expressed.']],
      prompt: 'Write a sentence that suggests tiredness without using “tired,” and explain the implicit meaning.',
      cloze: 'The request remained ___: no one stated it, but the context suggested it.', distractors: ['explicit', 'declared', 'directly stated'], reason: 'Implicit describes a meaning suggested by context rather than directly stated.'},
    examples: [['Há um pedido implícito na observação sobre a janela aberta.', 'There is an implicit request in the remark about the open window.'], ['O texto deixa implícito que a decisão ainda pode mudar.', 'The text leaves it implicit that the decision may still change.']]
  },
  {
    pt: {word: 'objetivo', partOfSpeech: 'adjetivo', meaning: 'Que procura se apoiar em fatos ou critérios observáveis, reduzindo a influência de preferências pessoais.',
      usage: 'Aqui, objetivo é adjetivo. Chamar um relato de objetivo não elimina a necessidade de explicar os critérios usados.',
      alternatives: [['imparcial', 'Destaca a ausência de favorecimento de uma parte.'], ['factual', 'Destaca informações sobre fatos, sem garantir que sua seleção seja imparcial.']],
      prompt: 'Descreva uma sala usando três informações observáveis. Evite julgamentos como “bonita” ou “horrível”.',
      cloze: 'O relato pretende ser ___: descreve o que foi observado e distingue os fatos das preferências pessoais.', distractors: ['tendencioso', 'arbitrário', 'puramente subjetivo'], reason: 'Objetivo indica a tentativa de apoiar o relato em observações, em vez de apenas em preferências.'},
    en: {word: 'objective', partOfSpeech: 'adjective', meaning: 'Based on observable information or stated criteria rather than personal preference alone.',
      usage: 'This lesson uses the adjective, not the noun meaning “goal.” Calling a report objective does not remove the need to explain its criteria.',
      alternatives: [['impartial', 'Emphasizes not favoring one side.'], ['factual', 'Emphasizes facts, though their selection may still reflect a particular perspective.']],
      prompt: 'Describe a room using three observable details. Avoid judgments such as “beautiful” or “awful.”',
      cloze: 'The account aims to be ___: it reports observations and separates facts from personal preferences.', distractors: ['biased', 'arbitrary', 'purely subjective'], reason: 'Objective describes an effort to base the account on observations rather than personal preference alone.'},
    examples: [['O relato objetivo distingue a observação da opinião.', 'The objective account distinguishes observation from opinion.'], ['Adotamos um critério objetivo: a data de inscrição.', 'We adopted an objective criterion: the registration date.']]
  },
  {
    pt: {word: 'provisório', partOfSpeech: 'adjetivo', meaning: 'Adotado por enquanto, com possibilidade ou expectativa de revisão.',
      usage: 'Ao chamar algo de provisório, informe, quando possível, qual condição ou data orientará a revisão.',
      alternatives: [['temporário', 'Destaca a duração limitada, sem necessariamente prever revisão.'], ['preliminar', 'Destaca uma etapa inicial que antecede o desenvolvimento ou a conclusão.']],
      prompt: 'Anuncie um horário provisório e informe quando a versão definitiva será confirmada.',
      cloze: 'O cronograma é ___ e poderá ser revisto após a confirmação das salas.', distractors: ['definitivo', 'imutável', 'irreversível'], reason: 'Provisório indica uma solução adotada por enquanto e sujeita a revisão.'},
    en: {word: 'provisional', partOfSpeech: 'adjective', meaning: 'Accepted or arranged for the present but subject to later revision or confirmation.',
      usage: 'When describing something as provisional, state what will allow it to be confirmed or revised.',
      alternatives: [['temporary', 'Emphasizes limited duration without necessarily implying later confirmation.'], ['preliminary', 'Emphasizes an early stage before fuller work or a final decision.']],
      prompt: 'Announce a provisional schedule and explain when the final version will be confirmed.',
      cloze: 'The schedule is ___ and may be revised once the rooms are confirmed.', distractors: ['final', 'unchangeable', 'irreversible'], reason: 'Provisional means accepted for now while remaining open to revision or confirmation.'},
    examples: [['Este é um calendário provisório, sujeito à confirmação da equipe.', 'This is a provisional calendar, subject to confirmation by the team.'], ['O título provisório será revisto depois da redação do texto.', 'The provisional title will be revised after the text is written.']]
  },
  {
    pt: {word: 'abrangente', partOfSpeech: 'adjetivo', meaning: 'Que cobre uma ampla variedade dos aspectos relevantes de um assunto.',
      usage: 'Abrangente descreve a extensão do que é tratado. Não significa que todos os detalhes possíveis foram incluídos.',
      alternatives: [['amplo', 'Destaca extensão ou variedade, sem necessariamente avaliar a cobertura de um assunto.'], ['completo', 'Sugere que nada necessário falta dentro de um escopo definido.']],
      prompt: 'Planeje uma explicação abrangente sobre um hobby: liste quatro aspectos relevantes que pretende abordar.',
      cloze: 'O guia é ___: trata de preparação, execução, revisão e dificuldades frequentes.', distractors: ['restrito a um detalhe', 'fragmentário', 'limitado ao título'], reason: 'Abrangente destaca a cobertura de diversos aspectos relevantes do tema.'},
    en: {word: 'comprehensive', partOfSpeech: 'adjective', meaning: 'Covering the main relevant aspects of a subject thoroughly.',
      usage: 'Comprehensive describes coverage, not mere length. State the scope so readers know what the account includes.',
      alternatives: [['broad', 'Emphasizes range without necessarily implying thorough treatment.'], ['exhaustive', 'Makes the stronger claim that every relevant possibility or detail is covered.']],
      prompt: 'Plan a comprehensive explanation of a hobby by listing four important aspects to cover.',
      cloze: 'The guide is ___: it covers preparation, execution, review, and common difficulties in detail.', distractors: ['restricted to one detail', 'fragmentary', 'limited to the title'], reason: 'Comprehensive describes thorough coverage of the main relevant aspects.'},
    examples: [['O guia oferece uma visão abrangente das etapas do projeto.', 'The guide offers a comprehensive overview of the project’s stages.'], ['Uma revisão abrangente considera o conteúdo e a organização do texto.', 'A comprehensive review considers both the content and the organization of the text.']]
  },
  {
    pt: {word: 'específico', partOfSpeech: 'adjetivo', meaning: 'Que se refere a um caso, aspecto ou detalhe particular, em vez de algo geral.',
      usage: 'Um exemplo específico mostra um caso concreto. Escolha detalhes que esclareçam a ideia, sem acrescentar informação irrelevante.',
      alternatives: [['particular', 'Destaca um caso individual ou uma característica própria.'], ['preciso', 'Destaca exatidão e limites bem definidos.']],
      prompt: 'Troque “Quero melhorar meus estudos” por um objetivo específico que nomeie uma ação observável.',
      cloze: 'Em vez de pedir “melhorias”, dê um exemplo ___, como reorganizar o segundo parágrafo.', distractors: ['genérico', 'indefinido', 'abrangente demais'], reason: 'Específico aponta para uma alteração concreta e particular.'},
    en: {word: 'specific', partOfSpeech: 'adjective', meaning: 'Referring to a particular thing, case, or detail rather than something general.',
      usage: 'A specific example makes an idea concrete. Choose details that help the reader understand the point.',
      alternatives: [['particular', 'Emphasizes an individual case or item.'], ['precise', 'Emphasizes exactness and clearly defined limits.']],
      prompt: 'Replace “I want to improve my studying” with a specific goal that names an observable action.',
      cloze: 'Instead of asking for “improvements,” give a ___ example, such as reorganizing the second paragraph.', distractors: ['generic', 'undefined', 'overly broad'], reason: 'Specific identifies a particular, concrete change rather than a general request.'},
    examples: [['Ela apresentou um exemplo específico da dificuldade.', 'She gave a specific example of the difficulty.'], ['O objetivo específico desta revisão é esclarecer o primeiro parágrafo.', 'The specific goal of this revision is to clarify the first paragraph.']]
  },
  {
    pt: {word: 'viável', partOfSpeech: 'adjetivo', meaning: 'Que pode ser realizado nas condições e com os recursos disponíveis.',
      usage: 'Uma proposta viável não é necessariamente a melhor. Explique quais condições tornam sua execução possível.',
      alternatives: [['possível', 'Indica que algo pode ocorrer, sem avaliar todos os recursos necessários.'], ['prático', 'Pode destacar facilidade de uso ou adequação à execução cotidiana.']],
      prompt: 'Proponha uma rotina de escrita viável para uma semana ocupada e explique quais recursos ela exige.',
      cloze: 'Com o tempo e os materiais disponíveis, o plano é ___: conseguimos executá-lo.', distractors: ['inexequível', 'impraticável', 'impossível'], reason: 'Viável liga a possibilidade de execução às condições efetivamente disponíveis.'},
    en: {word: 'feasible', partOfSpeech: 'adjective', meaning: 'Possible to carry out under the available conditions and with the available resources.',
      usage: 'A feasible plan is not necessarily the best plan. Explain which resources and constraints make it achievable.',
      alternatives: [['possible', 'Indicates that something can happen without necessarily assessing practical requirements.'], ['practical', 'Often emphasizes usefulness or suitability for real situations.']],
      prompt: 'Propose a feasible writing routine for a busy week and explain what resources it requires.',
      cloze: 'Given the available time and materials, the plan is ___: we can carry it out.', distractors: ['unworkable', 'impracticable', 'impossible'], reason: 'Feasible connects the ability to carry out the plan to the available conditions.'},
    examples: [['A proposta é viável com a equipe atual.', 'The proposal is feasible with the current team.'], ['Escrever dez minutos por dia é uma meta viável para esta semana.', 'Writing for ten minutes a day is a feasible goal for this week.']]
  },
  {
    pt: {word: 'premissa', partOfSpeech: 'substantivo feminino', meaning: 'Afirmação ou condição adotada como ponto de partida de um raciocínio.',
      usage: 'Uma premissa deve ser identificada e avaliada. Uma conclusão bem construída pode falhar se sua premissa não for adequada.',
      alternatives: [['pressuposto', 'Destaca algo tomado como dado, muitas vezes sem declaração explícita.'], ['hipótese', 'Costuma indicar uma explicação ou possibilidade a ser examinada.']],
      prompt: 'Escreva uma recomendação e identifique a premissa de que ela depende.',
      cloze: 'O argumento parte da ___ de que todos terão acesso ao material; esse ponto de partida precisa ser verificado.', distractors: ['conclusão final', 'consequência', 'resposta definitiva'], reason: 'Premissa é o ponto de partida do raciocínio, não seu resultado final.'},
    en: {word: 'premise', partOfSpeech: 'noun', meaning: 'A statement or condition used as a starting point for reasoning.',
      usage: 'Identify and assess a premise rather than treating it as automatically true. A conclusion may depend on an uncertain starting point.',
      alternatives: [['assumption', 'Emphasizes something taken as true, sometimes without being stated.'], ['hypothesis', 'Often describes a proposed explanation or possibility to be examined.']],
      prompt: 'Write a recommendation and identify the premise on which it depends.',
      cloze: 'The argument starts from the ___ that everyone will have access to the material; this starting point needs checking.', distractors: ['final conclusion', 'consequence', 'definitive answer'], reason: 'A premise is a starting point for reasoning rather than its final result.'},
    examples: [['A proposta depende da premissa de que a sala estará disponível.', 'The proposal depends on the premise that the room will be available.'], ['Precisamos examinar a premissa antes de aceitar a conclusão.', 'We need to examine the premise before accepting the conclusion.']]
  },
  {
    pt: {word: 'consequência', partOfSpeech: 'substantivo feminino', meaning: 'Efeito ou resultado que decorre de uma ação, situação ou fato.',
      usage: 'Uma consequência pode ser favorável, desfavorável ou neutra. Ao afirmar uma relação causal, explique o apoio para essa relação.',
      alternatives: [['resultado', 'Nomeia o que se obtém ao final de um processo, sem sempre destacar a causa.'], ['repercussão', 'Costuma destacar efeitos posteriores ou mais amplos.']],
      prompt: 'Descreva uma mudança pequena na sua rotina e uma consequência possível, deixando claro se é observada ou prevista.',
      cloze: 'A redução do espaço de armazenamento ocupado foi uma ___ direta da limpeza dos arquivos duplicados.', distractors: ['premissa anterior', 'causa inicial', 'condição prévia'], reason: 'Consequência nomeia o efeito da limpeza, enquanto as outras opções apontam para algo anterior.'},
    en: {word: 'consequence', partOfSpeech: 'noun', meaning: 'An effect or result that follows from an action, situation, or event.',
      usage: 'A consequence can be positive, negative, or neutral. Explain the support for a causal connection rather than assuming one.',
      alternatives: [['result', 'Names an outcome without always emphasizing the causal connection.'], ['repercussion', 'Usually suggests an indirect or later effect, often an unwelcome one.']],
      prompt: 'Describe a small change in your routine and one possible consequence. Indicate whether it is observed or predicted.',
      cloze: 'The reduction in storage use was a direct ___ of removing duplicate files.', distractors: ['earlier premise', 'initial cause', 'prior condition'], reason: 'Consequence names the effect of removing the files, not a condition that came before it.'},
    examples: [['A economia de tempo foi uma consequência da nova organização.', 'The time savings were a consequence of the new organization.'], ['Precisamos considerar a consequência dessa mudança para os leitores.', 'We need to consider the consequence of this change for readers.']]
  },
  {
    pt: {word: 'perspectiva', partOfSpeech: 'substantivo feminino', meaning: 'Ponto de vista a partir do qual um assunto é observado ou interpretado.',
      usage: 'Aqui, perspectiva significa ponto de vista. Identificar de quem é a perspectiva ajuda a delimitar a análise.',
      alternatives: [['ponto de vista', 'Expressão direta para a posição de quem observa ou avalia.'], ['enfoque', 'Destaca o aspecto escolhido como centro da atenção.']],
      prompt: 'Descreva uma biblioteca pela perspectiva de quem a visita pela primeira vez e de quem trabalha nela.',
      cloze: 'Para entender a experiência do leitor iniciante, examine o manual pela ___ dele.', distractors: ['velocidade', 'extensão', 'pontuação'], reason: 'Perspectiva indica o ponto de vista usado para examinar o manual.'},
    en: {word: 'perspective', partOfSpeech: 'noun', meaning: 'A point of view from which something is considered or interpreted.',
      usage: 'Name whose perspective you are using. A perspective frames an analysis but does not determine whether every claim in it is correct.',
      alternatives: [['point of view', 'A direct expression for an observer’s position or outlook.'], ['focus', 'Emphasizes the aspect receiving attention rather than the observer’s position.']],
      prompt: 'Describe a library from the perspective of a first-time visitor and then from that of someone who works there.',
      cloze: 'To understand a new reader’s experience, examine the manual from that reader’s ___.', distractors: ['speed', 'length', 'punctuation'], reason: 'Perspective identifies the point of view from which the manual is examined.'},
    examples: [['A experiência mudou minha perspectiva sobre o trabalho em grupo.', 'The experience changed my perspective on group work.'], ['Analise o aviso pela perspectiva de quem nunca esteve no prédio.', 'Analyze the notice from the perspective of someone who has never been in the building.']]
  },
  {
    pt: {word: 'refinar', partOfSpeech: 'verbo', meaning: 'Melhorar algo por meio de ajustes que aumentam sua qualidade ou precisão.',
      usage: 'Refinar um texto costuma envolver escolhas cuidadosas depois de existir uma primeira versão. Não é apenas acrescentar palavras difíceis.',
      alternatives: [['aprimorar', 'Expressa melhoria de modo amplo, com diferentes tipos de mudança.'], ['ajustar', 'Destaca uma modificação para adequar algo a uma necessidade.']],
      prompt: 'Escolha uma frase sua e refine a escolha dos verbos sem aumentar sua extensão.',
      cloze: 'A estrutura já funciona; agora vamos ___ a escolha das palavras para aumentar a precisão.', distractors: ['deteriorar', 'embaralhar', 'desconsiderar'], reason: 'Refinar indica melhorar uma versão existente por meio de ajustes cuidadosos.'},
    en: {word: 'refine', partOfSpeech: 'verb', meaning: 'To improve something through careful changes that make it more effective or precise.',
      usage: 'Refining a draft often means making deliberate choices after the main ideas are in place. It does not require more elaborate vocabulary.',
      alternatives: [['improve', 'A broad word for making something better in any way.'], ['adjust', 'Emphasizes changing something to fit a need or condition.']],
      prompt: 'Choose a sentence you wrote and refine its verbs without making it longer.',
      cloze: 'The structure already works; now we will ___ the wording to make it more precise.', distractors: ['damage', 'scramble', 'disregard'], reason: 'Refine means to improve an existing version through careful changes.'},
    examples: [['Vou refinar o argumento depois de receber os comentários.', 'I will refine the argument after receiving the comments.'], ['A segunda leitura ajuda a refinar a escolha das palavras.', 'A second reading helps refine the choice of words.']]
  },
  {
    pt: {word: 'priorizar', partOfSpeech: 'verbo', meaning: 'Dar precedência a algo por sua importância, urgência ou relação com um objetivo.',
      usage: 'Ao priorizar, declare o critério usado. Dar prioridade a uma tarefa não significa abandonar todas as outras.',
      alternatives: [['preferir', 'Destaca uma escolha pessoal e nem sempre envolve ordem de execução.'], ['ordenar', 'Organiza itens segundo um critério, que pode não ser a importância.']],
      prompt: 'Liste três melhorias possíveis em um texto e diga qual você vai priorizar e por quê.',
      cloze: 'Como o prazo é curto, vamos ___ a correção das informações essenciais antes de ajustar a aparência.', distractors: ['adiar indefinidamente', 'ignorar', 'abandonar'], reason: 'Priorizar dá precedência ao que mais importa para o objetivo dentro do prazo.'},
    en: {word: 'prioritize', partOfSpeech: 'verb', meaning: 'To give something precedence because of its importance, urgency, or connection to a goal.',
      usage: 'State the criterion for prioritizing. Giving one task priority does not necessarily mean abandoning the others. “Prioritise” is a common British spelling.',
      alternatives: [['prefer', 'Emphasizes a preference, not necessarily an order of action.'], ['rank', 'Places items in order according to a criterion, without itself deciding what to do first.']],
      prompt: 'List three possible improvements to a text. Say which you will prioritize and explain why.',
      cloze: 'With limited time, we will ___ correcting essential information before adjusting the appearance.', distractors: ['indefinitely postpone', 'ignore', 'abandon'], reason: 'Prioritize gives the most important task precedence under the time constraint.'},
    examples: [['Precisamos priorizar as dúvidas que impedem o início do trabalho.', 'We need to prioritize the questions that prevent work from starting.'], ['Vou priorizar a clareza antes de ajustar o tamanho do texto.', 'I will prioritize clarity before adjusting the length of the text.']]
  },
  {
    pt: {word: 'revisar', partOfSpeech: 'verbo', meaning: 'Examinar novamente um texto ou trabalho para avaliar e melhorar sua forma ou conteúdo.',
      usage: 'Revisar pode envolver reorganizar ideias, conferir informações e corrigir a linguagem; não se limita à ortografia.',
      alternatives: [['reler', 'É ler outra vez, sem necessariamente avaliar ou modificar o texto.'], ['editar', 'Pode envolver mudanças de conteúdo, forma e preparação para publicação.']],
      prompt: 'Revise um parágrafo seu em duas etapas: primeiro as ideias, depois a escolha das palavras e a pontuação.',
      cloze: 'Antes de enviar, vou ___ o texto para conferir as informações e melhorar sua organização.', distractors: ['descartar sem ler', 'ocultar', 'publicar sem conferir'], reason: 'Revisar é examinar novamente com o objetivo de avaliar e melhorar o texto.'},
    en: {word: 'revise', partOfSpeech: 'verb', meaning: 'To reconsider and change a text or plan in order to improve it.',
      usage: 'Revising a draft can change its ideas and structure, not just its spelling. In British English, revise can also mean study material again for an exam.',
      alternatives: [['proofread', 'Focuses on finding surface errors such as spelling, punctuation, and typing mistakes.'], ['edit', 'Can cover a range of changes to content, wording, and presentation.']],
      prompt: 'Revise a paragraph in two stages: first improve its ideas and organization, then check wording and punctuation.',
      cloze: 'Before sending it, I will ___ the draft to improve its organization and clarify the argument.', distractors: ['discard it unread', 'hide', 'publish it unchecked'], reason: 'Revise means to reconsider and improve the draft, including its organization and argument.'},
    examples: [['Vou revisar o texto antes de compartilhar a versão final.', 'I will revise the text before sharing the final version.'], ['Precisamos revisar o plano depois da mudança de prazo.', 'We need to revise the plan after the change in deadline.']]
  },
  {
    pt: {word: 'portanto', partOfSpeech: 'conector conclusivo', meaning: 'Introduz uma conclusão ou consequência apresentada como decorrente do que veio antes.',
      usage: 'Use portanto quando houver uma relação de conclusão sustentada pelo contexto. O conector não cria essa relação sozinho.',
      alternatives: [['assim', 'Pode introduzir uma conclusão, mas também indicar modo ou maneira.'], ['por isso', 'Destaca uma relação de causa e consequência em linguagem corrente.']],
      prompt: 'Escreva duas frases ligadas por “portanto”. Confira se a segunda realmente decorre da informação da primeira.',
      cloze: 'Todas as vagas estão ocupadas; ___, não há vagas disponíveis neste momento.', distractors: ['porém', 'apesar disso', 'em contrapartida'], reason: 'Portanto introduz a conclusão que decorre de todas as vagas estarem ocupadas.'},
    en: {word: 'therefore', partOfSpeech: 'linking adverb', meaning: 'Introduces a conclusion or consequence that follows from the preceding information.',
      usage: 'Between independent clauses, use a period or semicolon before therefore; a comma alone usually creates a comma splice in standard written English.',
      alternatives: [['thus', 'Often introduces a result or conclusion in more formal writing.'], ['so', 'A common coordinating conjunction for results; its sentence punctuation differs from therefore.']],
      prompt: 'Write two statements connected by “therefore.” Check that the second follows from the first and choose suitable punctuation.',
      cloze: 'All the places are occupied; ___, none are available at the moment.', distractors: ['however', 'nevertheless', 'by contrast'], reason: 'Therefore introduces the conclusion that follows from all the places being occupied.'},
    examples: [['O arquivo está incompleto; portanto, precisamos solicitar outra cópia.', 'The file is incomplete; therefore, we need to request another copy.'], ['O prazo termina hoje; portanto, enviarei a resposta agora.', 'The deadline is today; therefore, I will send the response now.']]
  },
];

function makeWordLesson(seed, language, examples, position) {
  const options = [...seed.distractors];
  options.splice(position, 0, seed.word);
  const slug = seed.word.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return {id: `${language}-${slug}`, language, word: seed.word, partOfSpeech: seed.partOfSpeech,
    meaning: seed.meaning, examples: examples.map(pair => ({text: pair[language === 'pt' ? 0 : 1], translation: pair[language === 'pt' ? 1 : 0]})),
    usage: seed.usage, alternatives: seed.alternatives.map(([word, note]) => ({word, note})), prompt: seed.prompt,
    quiz: {sentence: seed.cloze, options, answer: position, explanation: seed.reason}};
}

export const WORD_LESSONS = PAIRS.flatMap((pair, index) => [
  makeWordLesson(pair.pt, 'pt', pair.examples, index % 4),
  makeWordLesson(pair.en, 'en', pair.examples, (index + 2) % 4)
]);

export const WRITING_LESSONS = [
  {
    "id": "pt-writing-concordancia",
    "language": "pt",
    "title": "Faça o verbo concordar com o núcleo do sujeito",
    "before": "A lista de tarefas estão prontas.",
    "after": "A lista de tarefas está pronta.",
    "explanation": "Na escrita padrão, o verbo e o adjetivo concordam com ‘lista’, que está no singular. ‘De tarefas’ especifica o conteúdo da lista e não transforma o sujeito em plural. Para revisar, encontre primeiro o núcleo do sujeito.",
    "prompt": "Escreva uma frase cujo sujeito seja ‘O conjunto de ideias’. Depois marque o núcleo do sujeito e confira a concordância.",
    "quiz": {
      "sentence": "Qual opção completa a frase com concordância adequada à escrita padrão? ‘O conjunto de instruções ___.’",
      "options": [
        "estão disponíveis",
        "está disponível",
        "estão disponível",
        "está disponíveis"
      ],
      "answer": 1,
      "explanation": "O núcleo é ‘conjunto’, no singular. Por isso, usamos ‘está disponível’; ‘de instruções’ não determina a concordância."
    }
  },
  {
    "id": "pt-writing-virgula",
    "language": "pt",
    "title": "Não separe o sujeito do verbo com uma vírgula",
    "before": "A equipe de pesquisa, publicou o relatório ontem.",
    "after": "A equipe de pesquisa publicou o relatório ontem.",
    "explanation": "Nesta frase em ordem direta, a vírgula separava o sujeito ‘A equipe de pesquisa’ do verbo ‘publicou’. O tamanho do sujeito, por si só, não justifica essa pausa escrita. Um trecho intercalado pode receber duas vírgulas: ‘A equipe de pesquisa, após a reunião, publicou o relatório’.",
    "prompt": "Escreva uma frase com um sujeito de pelo menos quatro palavras. Leia-a e confira se você colocou uma vírgula apenas por sentir uma pausa na fala.",
    "quiz": {
      "sentence": "Qual frase em ordem direta evita uma vírgula que interrompe uma ligação sintática essencial?",
      "options": [
        "As novas regras, entram em vigor amanhã.",
        "As novas, regras entram em vigor amanhã.",
        "As novas regras entram em vigor amanhã.",
        "As novas regras entram, em vigor amanhã."
      ],
      "answer": 2,
      "explanation": "‘As novas regras’ é o sujeito de ‘entram’. Não há uma intercalação nessa frase que justifique as vírgulas apresentadas nas outras opções."
    }
  },
  {
    "id": "pt-writing-crase",
    "language": "pt",
    "title": "Observe a preposição e o artigo antes de usar a crase",
    "before": "Entreguei a carta a coordenadora.",
    "after": "Entreguei a carta à coordenadora.",
    "explanation": "Quem entrega algo a alguém usa a preposição ‘a’ para indicar a pessoa que recebe. Nesta frase, ‘coordenadora’ também vem com o artigo feminino ‘a’. A combinação ‘a + a’ é indicada por ‘à’. O acento não depende apenas de a palavra seguinte ser feminina.",
    "prompt": "Escreva uma frase com ‘enviei o documento’ e indique uma destinatária com artigo definido. Explique de onde vêm os dois elementos que formam ‘à’.",
    "quiz": {
      "sentence": "Em ‘Dirigi-me ___ biblioteca para estudar’, qual forma reúne a preposição exigida por ‘dirigir-se’ e o artigo feminino de ‘biblioteca’?",
      "options": [
        "à",
        "a",
        "há",
        "á"
      ],
      "answer": 0,
      "explanation": "‘Dirigir-se a’ fornece a preposição, e ‘a biblioteca’ fornece o artigo. Essa combinação é escrita ‘à biblioteca’."
    }
  },
  {
    "id": "pt-writing-por-que",
    "language": "pt",
    "title": "Diferencie a pergunta sobre o motivo da explicação",
    "before": "Não sei porque o prazo mudou.",
    "after": "Não sei por que o prazo mudou.",
    "explanation": "Na pergunta indireta ‘Não sei por que o prazo mudou’, ‘por que’ equivale a ‘por qual motivo’. Já ‘porque’ introduz uma explicação: ‘O prazo mudou porque faltavam dados’. O ponto de interrogação não é necessário para que exista uma pergunta indireta.",
    "prompt": "Escreva duas frases sobre uma mudança de plano: uma pergunta indireta com ‘por que’ e uma explicação com ‘porque’.",
    "quiz": {
      "sentence": "Complete a pergunta sobre o motivo: ‘___ você alterou o título?’",
      "options": [
        "Porque",
        "Porquê",
        "Por quê",
        "Por que"
      ],
      "answer": 3,
      "explanation": "No início dessa pergunta, usamos ‘por que’, com o sentido de ‘por qual motivo’. ‘Por quê’ apareceria antes da pausa final, como em ‘Você alterou o título por quê?’."
    }
  },
  {
    "id": "pt-writing-referencia",
    "language": "pt",
    "title": "Deixe claro a quem o pronome se refere",
    "before": "Lia escreveu para Bia quando ela terminou a revisão.",
    "after": "Quando Lia terminou a revisão, escreveu para Bia.",
    "explanation": "A primeira frase permite que ‘ela’ seja entendida como Lia ou Bia. A revisão deixa explícito que Lia terminou o trabalho. A frase original não precisa ter um erro gramatical para merecer uma revisão: evitar uma leitura ambígua também melhora a escrita.",
    "prompt": "Escreva uma frase sobre duas pessoas que usam o mesmo pronome. Depois substitua um pronome por um nome, ou reorganize a frase, para deixar clara a autoria de uma ação.",
    "quiz": {
      "sentence": "A intenção é dizer que Bia concluiu o texto. Qual frase deixa isso explícito?",
      "options": [
        "Quando Bia concluiu o texto, Lia telefonou para ela.",
        "Lia telefonou para Bia quando ela concluiu o texto.",
        "Lia telefonou para Bia depois de concluir o texto.",
        "Quando Lia concluiu o texto, telefonou para Bia."
      ],
      "answer": 0,
      "explanation": "A primeira opção nomeia Bia como sujeito de ‘concluiu’. Na segunda, ‘ela’ pode se referir a mais de uma pessoa; as outras opções atribuem a conclusão a Lia."
    }
  },
  {
    "id": "pt-writing-paralelismo",
    "language": "pt",
    "title": "Dê uma estrutura semelhante aos itens de uma lista",
    "before": "O curso ensina a planejar um texto, a revisão de argumentos e como editar frases.",
    "after": "O curso ensina a planejar um texto, revisar argumentos e editar frases.",
    "explanation": "A revisão apresenta três ações com verbos no infinitivo: ‘planejar’, ‘revisar’ e ‘editar’. Esse paralelismo ajuda o leitor a perceber que os itens têm a mesma função. Uma lista de substantivos também pode ser paralela; a escolha depende do que você quer destacar.",
    "prompt": "Descreva três etapas de uma tarefa usando verbos no infinitivo. Depois escreva outra versão com três substantivos e compare o efeito.",
    "quiz": {
      "sentence": "Qual versão apresenta três ações com verbos no infinitivo?",
      "options": [
        "O plano inclui pesquisa, revisar e a publicação.",
        "O plano inclui pesquisar, revisão e publicar.",
        "O plano inclui pesquisar, revisar e publicar.",
        "O plano inclui a pesquisa, a revisão e a publicação."
      ],
      "answer": 2,
      "explanation": "‘Pesquisar’, ‘revisar’ e ‘publicar’ são infinitivos. A última opção também tem uma estrutura paralela, mas apresenta substantivos, e não os verbos pedidos."
    }
  },
  {
    "id": "en-writing-agreement",
    "language": "en",
    "title": "Match the verb to the head of the subject",
    "before": "The list of changes are ready.",
    "after": "The list of changes is ready.",
    "explanation": "In standard written English, the singular head noun ‘list’ takes the singular verb ‘is’. The phrase ‘of changes’ tells us what the list contains; its plural noun does not control the verb. Find the head of the subject before checking agreement.",
    "prompt": "Write a sentence beginning with ‘The collection of notes’. Identify the head noun and check your verb.",
    "quiz": {
      "sentence": "Choose the sentence with standard subject–verb agreement.",
      "options": [
        "The box of notes are on the desk.",
        "The box of notes were on the desk.",
        "The box of notes be on the desk.",
        "The box of notes is on the desk."
      ],
      "answer": 3,
      "explanation": "The head noun ‘box’ is singular, so ‘is’ is the appropriate present-tense verb here. ‘Of notes’ does not make the subject plural."
    }
  },
  {
    "id": "en-writing-its",
    "language": "en",
    "title": "Keep possessive ‘its’ separate from ‘it's’",
    "before": "The company changed it's name.",
    "after": "The company changed its name.",
    "explanation": "‘Its’ shows possession or association: the name belongs to the company. ‘It's’ is a contraction of ‘it is’ or ‘it has’. Try expanding the contraction while revising: ‘The company changed it is name’ does not express the intended meaning.",
    "prompt": "Write one sentence containing possessive ‘its’ and a second sentence in which ‘it's’ can be expanded to ‘it is’.",
    "quiz": {
      "sentence": "Choose the forms that complete this sentence: ‘___ clear that the app needs to improve ___ instructions.’",
      "options": [
        "Its; it's",
        "It's; its",
        "It's; it's",
        "Its; its"
      ],
      "answer": 1,
      "explanation": "‘It's clear’ means ‘It is clear’. The instructions belong to the app, so the second blank takes possessive ‘its’."
    }
  },
  {
    "id": "en-writing-comma-splice",
    "language": "en",
    "title": "Give two complete clauses an appropriate connection",
    "before": "The draft is clear, the ending needs work.",
    "after": "The draft is clear, but the ending needs work.",
    "explanation": "Each part can stand as a sentence. In standard expository writing, a comma alone usually does not join two independent clauses. Here, adding ‘but’ makes the contrast explicit. A full stop or a semicolon would offer other valid ways to connect these ideas.",
    "prompt": "Write two short complete clauses about a piece of work. Join them with a comma and ‘but’, then try a version with a full stop.",
    "quiz": {
      "sentence": "Which revision joins two complete clauses with a coordinating conjunction and the usual comma?",
      "options": [
        "The report is useful, but it needs an update.",
        "The report is useful, it needs an update.",
        "The report is useful but, it needs an update.",
        "The report is useful, and, it needs an update."
      ],
      "answer": 0,
      "explanation": "The comma goes before ‘but’, which connects the independent clauses and signals contrast. The other options either omit the conjunction or place commas where this sentence does not need them."
    }
  },
  {
    "id": "en-writing-parallelism",
    "language": "en",
    "title": "Use a consistent form for related actions",
    "before": "The workshop focuses on planning, clear arguments, and how to revise.",
    "after": "The workshop focuses on planning, developing clear arguments, and revising.",
    "explanation": "The revised list uses three action phrases beginning with -ing forms. This consistent structure makes the items easier to compare. Parallelism is a tool for clarity: the goal is to match the function of the items, not to force every sentence into the same pattern.",
    "prompt": "Describe three activities you enjoy using three -ing forms. Check that each item fits naturally after the same opening phrase.",
    "quiz": {
      "sentence": "Which list presents three activities with matching -ing forms?",
      "options": [
        "The session includes drafting, discussion, and to edit.",
        "The session includes drafting, to discuss, and editing.",
        "The session includes drafting, discussing, and editing.",
        "The session includes a draft, a discussion, and an edit."
      ],
      "answer": 2,
      "explanation": "‘Drafting’, ‘discussing’, and ‘editing’ share the requested form. The last option has parallel noun phrases, but it does not use the -ing forms requested in the question."
    }
  },
  {
    "id": "en-writing-reference",
    "language": "en",
    "title": "Make a pronoun's reference clear",
    "before": "Maya thanked Eva after she revised the draft.",
    "after": "After Eva revised the draft, Maya thanked her.",
    "explanation": "In the first sentence, ‘she’ could mean Maya or Eva. The revision makes Eva the person who revised the draft. Repeating a name can be more useful than avoiding repetition when the reader needs to know who performed an action.",
    "prompt": "Write a sentence about two people who use the same pronoun. Revise it so that the person responsible for each action is explicit.",
    "quiz": {
      "sentence": "Which sentence clearly says that Maya wrote the summary?",
      "options": [
        "Maya called Eva after she wrote the summary.",
        "After Maya wrote the summary, she called Eva.",
        "Maya called Eva after Eva wrote the summary.",
        "Maya called Eva about her summary."
      ],
      "answer": 1,
      "explanation": "The second option names Maya as the subject of ‘wrote’. The third names Eva instead; the first and fourth leave a pronoun open to more than one interpretation."
    }
  },
  {
    "id": "en-writing-concision",
    "language": "en",
    "title": "Shorten a sentence without changing its meaning",
    "before": "At this point in time, we are in the process of reviewing the draft.",
    "after": "We are reviewing the draft now.",
    "explanation": "‘Now’ expresses the time reference, and ‘are reviewing’ already presents an ongoing action. Removing the longer phrases makes this update easier to read. Longer wording can serve a purpose in another context; concision means keeping useful meaning, not deleting words mechanically.",
    "prompt": "Write a two-sentence progress update. Look for one phrase you can shorten while preserving the action, timing, and degree of certainty.",
    "quiz": {
      "sentence": "Which revision keeps the meaning of ‘We made a decision to postpone the meeting’ with fewer words?",
      "options": [
        "We decided to postpone the meeting.",
        "We planned to discuss postponing the meeting.",
        "We cancelled the meeting permanently.",
        "We may postpone the meeting."
      ],
      "answer": 0,
      "explanation": "‘Decided’ expresses ‘made a decision’. The other choices change the action or the certainty: discussing, cancelling, and considering a possibility are different from deciding to postpone."
    }
  }
];
