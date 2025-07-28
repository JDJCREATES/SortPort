/**
 * Query Agent LCEL Chains
 * 
 * NEW: LCEL query analysis, semantic parsing, and context enrichment.
 */

import { RunnableSequence, RunnableLambda, RunnableParallel } from '@langchain/core/runnables';
import { RunnableBranch } from '../../core/lcel/runnable_branch';
import { ChatOpenAI } from '@langchain/openai';

export class QueryChains {
  private llm: ChatOpenAI;
  
  constructor() {
    this.llm = new ChatOpenAI({ model: 'gpt-4o-mini', temperature: 0.1 });
  }

  createQueryAnalysisChain(): RunnableSequence {
    return RunnableSequence.from([
      RunnableLambda.from((input: any) => this.parseQuery(input)),
      RunnableLambda.from((input: any) => this.analyzeSemantics(input)),
      RunnableLambda.from((input: any) => this.enrichContext(input))
    ]);
  }

  createIntentClassificationChain(): RunnableBranch {
    return RunnableBranch.create([
      [(input: any) => input.query.includes('sort'), RunnableLambda.from((input: any) => this.classifySortIntent(input))],
      [(input: any) => input.query.includes('filter'), RunnableLambda.from((input: any) => this.classifyFilterIntent(input))],
      [(input: any) => input.query.includes('group'), RunnableLambda.from((input: any) => this.classifyGroupIntent(input))]
    ], RunnableLambda.from((input: any) => this.classifyGenericIntent(input)));
  }

  createParameterExtractionChain(): RunnableParallel<any> {
    return RunnableParallel.from({
      sortParams: RunnableLambda.from((input: any) => this.extractSortParameters(input)),
      filterParams: RunnableLambda.from((input: any) => this.extractFilterParameters(input)),
      outputParams: RunnableLambda.from((input: any) => this.extractOutputParameters(input))
    });
  }

  private parseQuery(input: any): any {
    const query = typeof input === 'string' ? input : input.query;
    
    return {
      ...input,
      parsedQuery: {
        original: query,
        normalized: query.toLowerCase().trim(),
        tokens: this.tokenizeQuery(query),
        entities: this.extractEntities(query),
        keywords: this.extractKeywords(query)
      }
    };
  }

  private analyzeSemantics(input: any): any {
    const { parsedQuery } = input;
    
    return {
      ...input,
      semantics: {
        intent: this.inferPrimaryIntent(parsedQuery),
        subIntents: this.inferSubIntents(parsedQuery),
        context: this.analyzeQueryContext(parsedQuery),
        complexity: this.assessQueryComplexity(parsedQuery),
        ambiguity: this.detectAmbiguity(parsedQuery)
      }
    };
  }

  private enrichContext(input: any): any {
    const { parsedQuery, semantics } = input;
    
    return {
      ...input,
      enrichedContext: {
        userContext: input.userContext || {},
        sessionContext: input.sessionContext || {},
        domainContext: this.buildDomainContext(parsedQuery),
        historyContext: this.buildHistoryContext(input),
        preferences: this.inferUserPreferences(parsedQuery, input.userContext)
      }
    };
  }

  private classifySortIntent(input: any): any {
    const { parsedQuery } = input;
    const sortKeywords = this.extractSortKeywords(parsedQuery.normalized);
    
    return {
      intent: 'sort',
      subIntent: this.determineSortType(sortKeywords),
      confidence: this.calculateSortConfidence(sortKeywords),
      parameters: {
        criteria: this.extractSortCriteria(parsedQuery),
        direction: this.extractSortDirection(parsedQuery),
        method: this.inferSortMethod(parsedQuery)
      }
    };
  }

  private classifyFilterIntent(input: any): any {
    const { parsedQuery } = input;
    const filterKeywords = this.extractFilterKeywords(parsedQuery.normalized);
    
    return {
      intent: 'filter',
      subIntent: this.determineFilterType(filterKeywords),
      confidence: this.calculateFilterConfidence(filterKeywords),
      parameters: {
        conditions: this.extractFilterConditions(parsedQuery),
        operators: this.extractFilterOperators(parsedQuery),
        values: this.extractFilterValues(parsedQuery)
      }
    };
  }

  private classifyGroupIntent(input: any): any {
    const { parsedQuery } = input;
    const groupKeywords = this.extractGroupKeywords(parsedQuery.normalized);
    
    return {
      intent: 'group',
      subIntent: this.determineGroupType(groupKeywords),
      confidence: this.calculateGroupConfidence(groupKeywords),
      parameters: {
        criteria: this.extractGroupCriteria(parsedQuery),
        method: this.inferGroupMethod(parsedQuery),
        size: this.extractGroupSize(parsedQuery)
      }
    };
  }

  private classifyGenericIntent(input: any): any {
    const { parsedQuery } = input;
    
    return {
      intent: 'generic',
      subIntent: 'general_query',
      confidence: 0.5,
      parameters: {
        query: parsedQuery.original,
        keywords: parsedQuery.keywords,
        context: 'general'
      }
    };
  }

  private extractSortParameters(input: any): any {
    const { parsedQuery } = input;
    
    return {
      criteria: this.extractSortCriteria(parsedQuery),
      direction: this.extractSortDirection(parsedQuery) || 'asc',
      algorithm: this.inferSortAlgorithm(parsedQuery),
      priority: this.extractSortPriority(parsedQuery),
      weights: this.extractSortWeights(parsedQuery)
    };
  }

  private extractFilterParameters(input: any): any {
    const { parsedQuery } = input;
    
    return {
      conditions: this.extractFilterConditions(parsedQuery),
      operators: this.extractFilterOperators(parsedQuery),
      values: this.extractFilterValues(parsedQuery),
      logic: this.extractFilterLogic(parsedQuery) || 'AND',
      strictness: this.extractFilterStrictness(parsedQuery)
    };
  }

  private extractOutputParameters(input: any): any {
    const { parsedQuery } = input;
    
    return {
      format: this.extractOutputFormat(parsedQuery) || 'standard',
      fields: this.extractOutputFields(parsedQuery),
      limit: this.extractOutputLimit(parsedQuery),
      pagination: this.extractPaginationInfo(parsedQuery),
      metadata: this.extractMetadataRequirements(parsedQuery)
    };
  }

  // Helper methods for query parsing
  private tokenizeQuery(query: string): string[] {
    return query.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 0);
  }

  private extractEntities(query: string): string[] {
    const entities: string[] = [];
    const entityPatterns = [
      /\b(date|time|year|month|day)\b/gi,
      /\b(size|resolution|dimension)\b/gi,
      /\b(quality|rating|score)\b/gi,
      /\b(person|people|face|faces)\b/gi,
      /\b(animal|pet|dog|cat)\b/gi,
      /\b(location|place|city|country)\b/gi
    ];
    
    entityPatterns.forEach(pattern => {
      const matches = query.match(pattern);
      if (matches) entities.push(...matches);
    });
    
    return [...new Set(entities)];
  }

  private extractKeywords(query: string): string[] {
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
    const tokens = this.tokenizeQuery(query);
    return tokens.filter(token => !stopWords.has(token) && token.length > 2);
  }

  private inferPrimaryIntent(parsedQuery: any): string {
    const { normalized, keywords } = parsedQuery;
    
    if (this.containsSortTerms(normalized)) return 'sort';
    if (this.containsFilterTerms(normalized)) return 'filter';
    if (this.containsGroupTerms(normalized)) return 'group';
    if (this.containsSearchTerms(normalized)) return 'search';
    if (this.containsAnalysisTerms(normalized)) return 'analyze';
    
    return 'general';
  }

  private inferSubIntents(parsedQuery: any): string[] {
    const subIntents: string[] = [];
    const { normalized } = parsedQuery;
    
    if (this.containsSortTerms(normalized)) subIntents.push('sort');
    if (this.containsFilterTerms(normalized)) subIntents.push('filter');
    if (this.containsGroupTerms(normalized)) subIntents.push('group');
    
    return subIntents;
  }

  private analyzeQueryContext(parsedQuery: any): any {
    return {
      domain: this.inferDomain(parsedQuery),
      timeframe: this.extractTimeframe(parsedQuery),
      scope: this.inferScope(parsedQuery),
      urgency: this.assessUrgency(parsedQuery)
    };
  }

  private assessQueryComplexity(parsedQuery: any): number {
    let complexity = 0;
    complexity += parsedQuery.tokens.length * 0.1;
    complexity += parsedQuery.entities.length * 0.2;
    complexity += this.countLogicalOperators(parsedQuery.normalized) * 0.3;
    return Math.min(complexity, 1.0);
  }

  private detectAmbiguity(parsedQuery: any): number {
    let ambiguity = 0;
    const { normalized, keywords } = parsedQuery;
    
    // Check for ambiguous terms
    const ambiguousTerms = ['good', 'bad', 'nice', 'better', 'similar', 'like'];
    ambiguity += ambiguousTerms.filter(term => normalized.includes(term)).length * 0.2;
    
    // Check for vague quantifiers
    const vague = ['some', 'many', 'few', 'several', 'most'];
    ambiguity += vague.filter(term => normalized.includes(term)).length * 0.15;
    
    return Math.min(ambiguity, 1.0);
  }

  // Intent classification helpers
  private containsSortTerms(query: string): boolean {
    const sortTerms = ['sort', 'order', 'arrange', 'organize', 'rank', 'prioritize', 'sequence'];
    return sortTerms.some(term => query.includes(term));
  }

  private containsFilterTerms(query: string): boolean {
    const filterTerms = ['filter', 'select', 'choose', 'pick', 'exclude', 'include', 'remove', 'keep'];
    return filterTerms.some(term => query.includes(term));
  }

  private containsGroupTerms(query: string): boolean {
    const groupTerms = ['group', 'cluster', 'category', 'categorize', 'classify', 'organize'];
    return groupTerms.some(term => query.includes(term));
  }

  private containsSearchTerms(query: string): boolean {
    const searchTerms = ['find', 'search', 'look', 'locate', 'discover'];
    return searchTerms.some(term => query.includes(term));
  }

  private containsAnalysisTerms(query: string): boolean {
    const analysisTerms = ['analyze', 'examine', 'study', 'review', 'assess', 'evaluate'];
    return analysisTerms.some(term => query.includes(term));
  }

  // Parameter extraction helpers
  private extractSortCriteria(parsedQuery: any): string[] {
    const criteria: string[] = [];
    const { normalized, entities } = parsedQuery;
    
    if (normalized.includes('date') || normalized.includes('time')) criteria.push('date');
    if (normalized.includes('size') || normalized.includes('file size')) criteria.push('size');
    if (normalized.includes('quality') || normalized.includes('resolution')) criteria.push('quality');
    if (normalized.includes('name') || normalized.includes('filename')) criteria.push('name');
    if (normalized.includes('relevance') || normalized.includes('score')) criteria.push('relevance');
    
    return criteria.length > 0 ? criteria : ['relevance'];
  }

  private extractSortDirection(parsedQuery: any): string | null {
    const { normalized } = parsedQuery;
    
    if (normalized.includes('descending') || normalized.includes('desc') || normalized.includes('newest') || normalized.includes('largest')) {
      return 'desc';
    }
    if (normalized.includes('ascending') || normalized.includes('asc') || normalized.includes('oldest') || normalized.includes('smallest')) {
      return 'asc';
    }
    
    return null;
  }

  private inferSortMethod(parsedQuery: any): string {
    const { normalized } = parsedQuery;
    
    if (normalized.includes('smart') || normalized.includes('intelligent')) return 'smart';
    if (normalized.includes('quick') || normalized.includes('fast')) return 'quick';
    if (normalized.includes('accurate') || normalized.includes('precise')) return 'precise';
    
    return 'standard';
  }

  // Additional helper methods
  private buildDomainContext(parsedQuery: any): any {
    return {
      imageTypes: this.inferImageTypes(parsedQuery),
      categories: this.inferCategories(parsedQuery),
      metadata: this.inferMetadataNeeds(parsedQuery)
    };
  }

  private buildHistoryContext(input: any): any {
    return {
      recentQueries: input.sessionContext?.recentQueries || [],
      preferences: input.userContext?.preferences || {},
      patterns: this.analyzeQueryPatterns(input)
    };
  }

  private inferUserPreferences(parsedQuery: any, userContext: any): any {
    return {
      sortPreference: userContext?.defaultSort || 'relevance',
      qualityThreshold: userContext?.qualityThreshold || 0.7,
      outputFormat: userContext?.preferredFormat || 'standard'
    };
  }

  // Utility methods for pattern matching
  private extractSortKeywords(query: string): string[] {
    const sortKeywords = ['sort', 'order', 'arrange', 'rank', 'prioritize'];
    return sortKeywords.filter(keyword => query.includes(keyword));
  }

  private extractFilterKeywords(query: string): string[] {
    const filterKeywords = ['filter', 'select', 'exclude', 'include', 'remove'];
    return filterKeywords.filter(keyword => query.includes(keyword));
  }

  private extractGroupKeywords(query: string): string[] {
    const groupKeywords = ['group', 'cluster', 'category', 'classify'];
    return groupKeywords.filter(keyword => query.includes(keyword));
  }

  private determineSortType(keywords: string[]): string {
    if (keywords.includes('rank')) return 'ranking';
    if (keywords.includes('prioritize')) return 'priority';
    return 'standard';
  }

  private determineFilterType(keywords: string[]): string {
    if (keywords.includes('exclude')) return 'exclusion';
    if (keywords.includes('include')) return 'inclusion';
    return 'condition';
  }

  private determineGroupType(keywords: string[]): string {
    if (keywords.includes('cluster')) return 'clustering';
    if (keywords.includes('classify')) return 'classification';
    return 'standard';
  }

  private calculateSortConfidence(keywords: string[]): number {
    return Math.min(keywords.length * 0.3 + 0.4, 1.0);
  }

  private calculateFilterConfidence(keywords: string[]): number {
    return Math.min(keywords.length * 0.3 + 0.4, 1.0);
  }

  private calculateGroupConfidence(keywords: string[]): number {
    return Math.min(keywords.length * 0.3 + 0.4, 1.0);
  }

  // Stub implementations for remaining methods
  private extractFilterConditions(parsedQuery: any): any[] { return []; }
  private extractFilterOperators(parsedQuery: any): string[] { return ['equals']; }
  private extractFilterValues(parsedQuery: any): any[] { return []; }
  private extractFilterLogic(parsedQuery: any): string | null { return null; }
  private extractFilterStrictness(parsedQuery: any): number { return 0.8; }
  private extractGroupCriteria(parsedQuery: any): string[] { return ['similarity']; }
  private inferGroupMethod(parsedQuery: any): string { return 'kmeans'; }
  private extractGroupSize(parsedQuery: any): number | null { return null; }
  private inferSortAlgorithm(parsedQuery: any): string { return 'merge'; }
  private extractSortPriority(parsedQuery: any): number { return 1.0; }
  private extractSortWeights(parsedQuery: any): Record<string, number> { return {}; }
  private extractOutputFormat(parsedQuery: any): string | null { return null; }
  private extractOutputFields(parsedQuery: any): string[] { return []; }
  private extractOutputLimit(parsedQuery: any): number | null { return null; }
  private extractPaginationInfo(parsedQuery: any): any { return {}; }
  private extractMetadataRequirements(parsedQuery: any): string[] { return []; }
  private inferDomain(parsedQuery: any): string { return 'images'; }
  private extractTimeframe(parsedQuery: any): any { return {}; }
  private inferScope(parsedQuery: any): string { return 'collection'; }
  private assessUrgency(parsedQuery: any): number { return 0.5; }
  private countLogicalOperators(query: string): number { 
    const operators = ['and', 'or', 'not', 'but'];
    return operators.filter(op => query.includes(op)).length;
  }
  private inferImageTypes(parsedQuery: any): string[] { return []; }
  private inferCategories(parsedQuery: any): string[] { return []; }
  private inferMetadataNeeds(parsedQuery: any): string[] { return []; }
  private analyzeQueryPatterns(input: any): any { return {}; }
}
