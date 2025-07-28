/**
 * Query Processing Agent
 * 
 * Natural language understanding agent for intent classification, parameter extraction,
 * and query preprocessing for the sorting system.
 * 
 * Input: Raw user query string and context
 * Output: Structured query with intent, parameters, and processing instructions
 * 
 * Key Methods:
 * - processQuery(query, context): Process natural language query
 * - classifyIntent(query): Classify user intent (sort, search, filter, etc.)
 * - extractParameters(query, intent): Extract sorting parameters from query
 * - enrichContext(query, context): Add contextual information
 * - validateQuery(query): Validate query completeness and feasibility
 * - suggestClarifications(query): Suggest clarification questions
 * - generateProcessingPlan(query): Create execution plan from query
 */

import { RunnableSequence, RunnableLambda, RunnableParallel } from '@langchain/core/runnables';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';

export interface QueryInput {
  query: string;
  context: {
    userId: string;
    images: any[];
    preferences?: UserPreferences;
    history?: QueryHistory[];
  };
  metadata?: Record<string, any>;
}

export interface ProcessedQuery {
  originalQuery: string;
  intent: QueryIntent;
  parameters: QueryParameters;
  processingInstructions: ProcessingInstructions;
  confidence: number;
  clarifications?: string[];
  executionPlan: ExecutionPlan;
  metadata: QueryMetadata;
}

export interface QueryIntent {
  primary: IntentType;
  secondary?: IntentType[];
  confidence: number;
  reasoning: string;
}

export interface QueryParameters {
  sortType?: SortType;
  filters?: FilterCriteria[];
  grouping?: GroupingCriteria;
  output?: OutputPreferences;
  constraints?: QueryConstraints;
  customCriteria?: any;
}

export interface ProcessingInstructions {
  useVision: boolean;
  maxVisionCalls: number;
  enableCaching: boolean;
  prioritizeSpeed: boolean;
  costOptimization: boolean;
  qualityThreshold: number;
}

export interface ExecutionPlan {
  steps: ExecutionStep[];
  parallelizable: boolean;
  estimatedDuration: number;
  estimatedCost: number;
  dependencies: string[];
}

export interface ExecutionStep {
  name: string;
  type: 'analysis' | 'sorting' | 'filtering' | 'grouping' | 'ranking';
  agent: 'task' | 'tool' | 'query';
  chain: string;
  parameters: any;
  optional: boolean;
}

export enum IntentType {
  SORT_BY_CONTENT = 'sort_by_content',
  SORT_BY_TIME = 'sort_by_time',
  SORT_BY_PEOPLE = 'sort_by_people',
  SORT_BY_LOCATION = 'sort_by_location',
  SORT_BY_QUALITY = 'sort_by_quality',
  SORT_BY_SIMILARITY = 'sort_by_similarity',
  SORT_BY_EMOTION = 'sort_by_emotion',
  FILTER_BY_CRITERIA = 'filter_by_criteria',
  GROUP_BY_THEME = 'group_by_theme',
  CREATE_ALBUMS = 'create_albums',
  SEARCH_SIMILAR = 'search_similar',
  ANALYZE_CONTENT = 'analyze_content',
  CUSTOM_SORTING = 'custom_sorting'
}

export enum SortType {
  CONTENT = 'content',
  TEMPORAL = 'temporal',
  PEOPLE = 'people',
  LOCATION = 'location',
  QUALITY = 'quality',
  SIMILARITY = 'similarity',
  EMOTION = 'emotion',
  CUSTOM = 'custom',
  SMART_ALBUMS = 'smart_albums'
}

export interface FilterCriteria {
  type: 'date' | 'location' | 'people' | 'content' | 'quality' | 'nsfw';
  operator: 'equals' | 'contains' | 'greater' | 'less' | 'between' | 'not';
  value: any;
  confidence: number;
}

export interface GroupingCriteria {
  type: 'theme' | 'time' | 'location' | 'people' | 'event';
  granularity: 'fine' | 'medium' | 'coarse';
  maxGroups: number;
  minGroupSize: number;
}

export interface OutputPreferences {
  format: 'list' | 'grid' | 'timeline' | 'albums';
  maxResults: number;
  includeMetadata: boolean;
  includeReasoning: boolean;
  thumbnailSize: 'small' | 'medium' | 'large';
}

export interface QueryConstraints {
  maxProcessingTime: number;
  maxCost: number;
  qualityThreshold: number;
  privacyLevel: 'standard' | 'high' | 'maximum';
}

export interface UserPreferences {
  preferredSort: SortType;
  useVisionSparingly: boolean;
  maxVisionCalls: number;
  favoriteStyles: string[];
  excludeNsfw: boolean;
}

export interface QueryHistory {
  query: string;
  timestamp: Date;
  intent: QueryIntent;
  success: boolean;
  userSatisfaction?: number;
}

export interface QueryMetadata {
  processingTime: number;
  modelUsed: string;
  confidence: number;
  ambiguityScore: number;
  complexityScore: number;
  tokens: {
    input: number;
    output: number;
  };
}

export class QueryProcessor {
  private llm: ChatOpenAI;
  private intentClassifier!: RunnableSequence;
  private parameterExtractor!: RunnableSequence;
  private planGenerator!: RunnableSequence;
  
  constructor() {
    this.llm = new ChatOpenAI({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      maxTokens: 2000
    });
    
    this.setupProcessingChains();
  }

  /**
   * Process natural language query into structured format
   */
  async processQuery(input: QueryInput): Promise<ProcessedQuery> {
    const startTime = Date.now();
    
    try {
      // Step 1: Classify intent
      const intent = await this.intentClassifier.invoke(input);
      
      // Step 2: Extract parameters
      const parametersWithIntent = { ...input, intent };
      const parameters = await this.parameterExtractor.invoke(parametersWithIntent);
      
      // Step 3: Generate execution plan
      const planInput = { ...parameters, intent };
      const executionPlan = await this.planGenerator.invoke(planInput);
      
      // Step 4: Validate and prepare result
      const processingTime = Date.now() - startTime;
      const ambiguity = this.detectAmbiguity(input.query);
      
      const result: ProcessedQuery = {
        originalQuery: input.query,
        intent,
        parameters: parameters.extractedParams || {},
        processingInstructions: parameters.processingInstructions,
        confidence: Math.min(intent.confidence, 1 - ambiguity),
        executionPlan,
        metadata: {
          processingTime,
          modelUsed: this.llm.model || 'gpt-4o-mini',
          confidence: intent.confidence,
          ambiguityScore: ambiguity,
          complexityScore: 0.5, // Default complexity
          tokens: {
            input: Math.ceil(input.query.length / 4), // Rough token estimate
            output: 100 // Estimated output tokens
          }
        }
      };
      
      // Calculate complexity after result is created
      result.metadata.complexityScore = this.calculateComplexityScore(result);
      
      // Add clarifications if needed
      if (intent.confidence < 0.7 || ambiguity > 0.3) {
        result.clarifications = this.suggestClarifications(result);
      }
      
      return result;
    } catch (error) {
      console.error('Query processing failed:', error);
      throw error;
    }
  }

  /**
   * Classify user intent from query
   */
  async classifyIntent(query: string, context?: any): Promise<QueryIntent> {
    const input = { query, context };
    return await this.intentClassifier.invoke(input);
  }

  /**
   * Extract sorting parameters from query
   */
  async extractParameters(query: string, intent: QueryIntent): Promise<QueryParameters> {
    const input = { query, intent };
    const result = await this.parameterExtractor.invoke(input);
    return result.extractedParams || {};
  }

  /**
   * Enrich context with additional information
   */
  async enrichContext(query: string, context: any): Promise<any> {
    return {
      ...context,
      timestamp: new Date(),
      queryLength: query.length,
      estimatedComplexity: this.detectAmbiguity(query),
      suggestedAnalysis: this.requiresVisionAnalysis(query)
    };
  }

  /**
   * Validate query completeness and feasibility
   */
  validateQuery(processedQuery: ProcessedQuery): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    
    if (!processedQuery.originalQuery || processedQuery.originalQuery.trim().length === 0) {
      issues.push('Query cannot be empty');
    }
    
    if (processedQuery.confidence < 0.3) {
      issues.push('Query confidence is too low - please be more specific');
    }
    
    if (processedQuery.metadata.ambiguityScore > 0.7) {
      issues.push('Query is too ambiguous - please clarify your intent');
    }
    
    if (processedQuery.executionPlan.estimatedCost > 1.0) {
      issues.push('Query is too expensive to execute');
    }
    
    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Suggest clarification questions for ambiguous queries
   */
  suggestClarifications(processedQuery: ProcessedQuery): string[] {
    const clarifications: string[] = [];
    
    if (processedQuery.metadata.ambiguityScore > 0.5) {
      clarifications.push('Could you be more specific about what you want to sort by?');
    }
    
    if (processedQuery.intent.confidence < 0.6) {
      clarifications.push('Are you looking to sort, filter, or group your images?');
    }
    
    if (processedQuery.intent.primary === IntentType.CUSTOM_SORTING) {
      clarifications.push('What specific criteria would you like to use for sorting?');
    }
    
    if (processedQuery.executionPlan.steps.some(step => step.type === 'analysis')) {
      clarifications.push('Should I analyze the visual content of your images for this task?');
    }
    
    return clarifications;
  }

  /**
   * Generate execution plan from processed query
   */
  async generateProcessingPlan(processedQuery: ProcessedQuery): Promise<ExecutionPlan> {
    return processedQuery.executionPlan;
  }

  /**
   * Learn from query feedback
   */
  async learnFromFeedback(
    query: string,
    processedQuery: ProcessedQuery,
    userFeedback: UserFeedback
  ): Promise<void> {
    // Simple feedback learning - could be enhanced with ML
    console.log(`Learning from feedback for query: "${query}"`);
    console.log(`User satisfaction: ${userFeedback.satisfied ? 'Yes' : 'No'}`);
    console.log(`Rating: ${userFeedback.rating}/5`);
    
    if (userFeedback.correctIntent && userFeedback.correctIntent !== processedQuery.intent.primary) {
      console.log(`Correct intent should have been: ${userFeedback.correctIntent}`);
    }
    
    // In a real implementation, this would update training data or model weights
  }

  /**
   * Setup processing chains
   */
  private setupProcessingChains(): void {
    // Setup intent classification chain
    this.intentClassifier = RunnableSequence.from([
      RunnableLambda.from((input: any) => this.preprocessQuery(input)),
      RunnableLambda.from(async (preprocessed: any) => {
        const query = preprocessed.query || preprocessed;
        const queryLower = query.toLowerCase();
        
        let primaryIntent: IntentType;
        let confidence = 0.8;
        
        if (queryLower.includes('sort') || queryLower.includes('organize')) {
          if (queryLower.includes('date') || queryLower.includes('time')) {
            primaryIntent = IntentType.SORT_BY_TIME;
          } else if (queryLower.includes('people') || queryLower.includes('face')) {
            primaryIntent = IntentType.SORT_BY_PEOPLE;
          } else if (queryLower.includes('location') || queryLower.includes('place')) {
            primaryIntent = IntentType.SORT_BY_LOCATION;
          } else if (queryLower.includes('quality') || queryLower.includes('best')) {
            primaryIntent = IntentType.SORT_BY_QUALITY;
          } else if (queryLower.includes('similar') || queryLower.includes('like')) {
            primaryIntent = IntentType.SORT_BY_SIMILARITY;
          } else if (queryLower.includes('emotion') || queryLower.includes('mood')) {
            primaryIntent = IntentType.SORT_BY_EMOTION;
          } else {
            primaryIntent = IntentType.SORT_BY_CONTENT;
          }
        } else if (queryLower.includes('filter') || queryLower.includes('find')) {
          primaryIntent = IntentType.FILTER_BY_CRITERIA;
        } else if (queryLower.includes('group') || queryLower.includes('cluster')) {
          primaryIntent = IntentType.GROUP_BY_THEME;
        } else if (queryLower.includes('album')) {
          primaryIntent = IntentType.CREATE_ALBUMS;
        } else if (queryLower.includes('search')) {
          primaryIntent = IntentType.SEARCH_SIMILAR;
        } else if (queryLower.includes('analyze') || queryLower.includes('description')) {
          primaryIntent = IntentType.ANALYZE_CONTENT;
        } else {
          primaryIntent = IntentType.CUSTOM_SORTING;
          confidence = 0.5;
        }
        
        return {
          primary: primaryIntent,
          confidence,
          reasoning: `Classified based on keywords in query: "${query}"`
        };
      })
    ]);

    // Setup parameter extraction chain
    this.parameterExtractor = RunnableSequence.from([
      RunnableLambda.from((input: any) => this.extractContextualParameters(input)),
      RunnableLambda.from((extracted: any) => ({
        ...extracted,
        processingInstructions: {
          useVision: extracted.requiresVision || false,
          maxVisionCalls: extracted.maxVisionCalls || 50,
          enableCaching: true,
          prioritizeSpeed: false,
          costOptimization: true,
          qualityThreshold: 0.7
        }
      }))
    ]);

    // Setup plan generation chain
    this.planGenerator = RunnableSequence.from([
      RunnableLambda.from((input: any) => this.analyzePlanRequirements(input)),
      RunnableLambda.from((analyzed: any) => {
        const steps: ExecutionStep[] = [];
        
        // Add analysis step if needed
        if (analyzed.requiresAnalysis) {
          steps.push({
            name: 'analyze_content',
            type: 'analysis',
            agent: 'tool',
            chain: 'vision_analysis',
            parameters: analyzed.analysisParams || {},
            optional: false
          });
        }
        
        // Add sorting step
        steps.push({
          name: 'sort_images',
          type: 'sorting',
          agent: 'task',
          chain: 'image_sort',
          parameters: analyzed.sortParams || {},
          optional: false
        });
        
        // Add filtering step if needed
        if (analyzed.requiresFiltering) {
          steps.push({
            name: 'filter_results',
            type: 'filtering',
            agent: 'tool',
            chain: 'content_filter',
            parameters: analyzed.filterParams || {},
            optional: true
          });
        }
        
        return {
          steps,
          parallelizable: steps.length > 1,
          estimatedDuration: steps.length * 1000,
          estimatedCost: steps.length * 0.01,
          dependencies: []
        };
      })
    ]);
  }

  /**
   * Preprocess query for better understanding
   */
  private preprocessQuery(input: any): any {
    const query = typeof input === 'string' ? input : input.query;
    
    return {
      query: query.trim().toLowerCase(),
      originalQuery: query,
      timestamp: new Date(),
      context: input.context || {}
    };
  }

  /**
   * Extract contextual parameters
   */
  private extractContextualParameters(input: any): any {
    const query = input.query || input.originalQuery || '';
    const context = input.context || {};
    
    return {
      extractedParams: {
        sortType: this.extractSortType(query),
        filters: this.extractFilters(query),
        maxResults: this.extractMaxResults(query) || 100,
        includeMetadata: query.includes('metadata') || query.includes('details'),
        thumbnailSize: this.extractThumbnailSize(query) || 'medium'
      },
      requiresVision: this.requiresVisionAnalysis(query),
      maxVisionCalls: Math.min(context.images?.length || 50, 100)
    };
  }

  /**
   * Analyze plan requirements
   */
  private analyzePlanRequirements(input: any): any {
    const intent = input.intent || {};
    const params = input.extractedParams || {};
    
    return {
      requiresAnalysis: this.requiresVisionAnalysis(input.query || ''),
      requiresFiltering: params.filters && params.filters.length > 0,
      analysisParams: {
        useVision: this.requiresVisionAnalysis(input.query || ''),
        analysisType: this.getAnalysisType(intent.primary)
      },
      sortParams: {
        type: params.sortType,
        criteria: this.getSortCriteria(intent.primary)
      },
      filterParams: params.filters || []
    };
  }

  /**
   * Helper method to extract sort type from query
   */
  private extractSortType(query: string): SortType {
    const queryLower = query.toLowerCase();
    
    if (queryLower.includes('date') || queryLower.includes('time')) {
      return SortType.TEMPORAL;
    } else if (queryLower.includes('people') || queryLower.includes('face')) {
      return SortType.PEOPLE;
    } else if (queryLower.includes('location') || queryLower.includes('place')) {
      return SortType.LOCATION;
    } else if (queryLower.includes('quality') || queryLower.includes('best')) {
      return SortType.QUALITY;
    } else if (queryLower.includes('similar')) {
      return SortType.SIMILARITY;
    } else if (queryLower.includes('emotion') || queryLower.includes('mood')) {
      return SortType.EMOTION;
    } else if (queryLower.includes('album')) {
      return SortType.SMART_ALBUMS;
    } else {
      return SortType.CONTENT;
    }
  }

  /**
   * Helper method to extract filters from query
   */
  private extractFilters(query: string): FilterCriteria[] {
    const filters: FilterCriteria[] = [];
    const queryLower = query.toLowerCase();
    
    // Date filters
    if (queryLower.includes('recent') || queryLower.includes('last')) {
      filters.push({
        type: 'date',
        operator: 'greater',
        value: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        confidence: 0.8
      });
    }
    
    // Quality filters
    if (queryLower.includes('high quality') || queryLower.includes('best')) {
      filters.push({
        type: 'quality',
        operator: 'greater',
        value: 0.7,
        confidence: 0.7
      });
    }
    
    return filters;
  }

  /**
   * Helper method to extract max results
   */
  private extractMaxResults(query: string): number | undefined {
    const matches = query.match(/(\d+)/g);
    if (matches) {
      const number = parseInt(matches[0]);
      if (number > 0 && number <= 1000) {
        return number;
      }
    }
    return undefined;
  }

  /**
   * Helper method to extract thumbnail size
   */
  private extractThumbnailSize(query: string): 'small' | 'medium' | 'large' {
    const queryLower = query.toLowerCase();
    if (queryLower.includes('small')) return 'small';
    if (queryLower.includes('large') || queryLower.includes('big')) return 'large';
    return 'medium';
  }

  /**
   * Check if query requires vision analysis
   */
  private requiresVisionAnalysis(query: string): boolean {
    const queryLower = query.toLowerCase();
    const visionKeywords = ['content', 'objects', 'scene', 'visual', 'appearance', 'color', 'style', 'similar', 'emotion', 'mood'];
    return visionKeywords.some(keyword => queryLower.includes(keyword));
  }

  /**
   * Get analysis type for intent
   */
  private getAnalysisType(intent: IntentType): string {
    switch (intent) {
      case IntentType.SORT_BY_CONTENT:
        return 'content_analysis';
      case IntentType.SORT_BY_PEOPLE:
        return 'face_detection';
      case IntentType.SORT_BY_EMOTION:
        return 'emotion_analysis';
      case IntentType.SORT_BY_QUALITY:
        return 'quality_assessment';
      default:
        return 'general_analysis';
    }
  }

  /**
   * Get sort criteria for intent
   */
  private getSortCriteria(intent: IntentType): any {
    switch (intent) {
      case IntentType.SORT_BY_TIME:
        return { field: 'timestamp', order: 'desc' };
      case IntentType.SORT_BY_QUALITY:
        return { field: 'quality_score', order: 'desc' };
      case IntentType.SORT_BY_SIMILARITY:
        return { field: 'similarity_score', order: 'desc' };
      default:
        return { field: 'relevance_score', order: 'desc' };
    }
  }

  /**
   * Calculate query complexity score
   */
  private calculateComplexityScore(processedQuery: ProcessedQuery): number {
    let complexity = 0;
    
    // Base complexity from intent type
    const intentComplexityMap: Record<IntentType, number> = {
      [IntentType.SORT_BY_TIME]: 0.2,
      [IntentType.SORT_BY_CONTENT]: 0.8,
      [IntentType.SORT_BY_PEOPLE]: 0.7,
      [IntentType.SORT_BY_LOCATION]: 0.5,
      [IntentType.SORT_BY_QUALITY]: 0.6,
      [IntentType.SORT_BY_SIMILARITY]: 0.9,
      [IntentType.SORT_BY_EMOTION]: 0.8,
      [IntentType.FILTER_BY_CRITERIA]: 0.4,
      [IntentType.GROUP_BY_THEME]: 0.7,
      [IntentType.CREATE_ALBUMS]: 0.6,
      [IntentType.SEARCH_SIMILAR]: 0.5,
      [IntentType.ANALYZE_CONTENT]: 0.9,
      [IntentType.CUSTOM_SORTING]: 1.0
    };
    
    complexity += intentComplexityMap[processedQuery.intent.primary] || 0.5;
    
    // Add complexity based on execution plan
    if (processedQuery.executionPlan.steps.length > 2) {
      complexity += 0.2;
    }
    
    if (processedQuery.executionPlan.parallelizable) {
      complexity += 0.1;
    }
    
    return Math.min(complexity, 1.0);
  }

  /**
   * Detect query ambiguity
   */
  private detectAmbiguity(query: string): number {
    let ambiguityScore = 0;
    const queryLower = query.toLowerCase();
    
    // Check for vague terms
    const vagueTerms = ['some', 'few', 'many', 'better', 'good', 'nice', 'best'];
    const foundVagueTerms = vagueTerms.filter(term => queryLower.includes(term));
    ambiguityScore += foundVagueTerms.length * 0.1;
    
    // Check for multiple possible intents
    const intentKeywords = ['sort', 'filter', 'group', 'find', 'search', 'organize'];
    const foundIntents = intentKeywords.filter(keyword => queryLower.includes(keyword));
    if (foundIntents.length > 1) {
      ambiguityScore += 0.3;
    }
    
    // Check for missing specificity
    if (queryLower.length < 10) {
      ambiguityScore += 0.2;
    }
    
    // Check for question words without clear context
    const questionWords = ['what', 'how', 'when', 'where', 'why'];
    const foundQuestions = questionWords.filter(word => queryLower.includes(word));
    if (foundQuestions.length > 0 && queryLower.length < 20) {
      ambiguityScore += 0.2;
    }
    
    return Math.min(ambiguityScore, 1.0);
  }

  /**
   * Internal intent classification helper
   */
  private async classifyIntentInternal(preprocessed: any): Promise<QueryIntent> {
    // Simple classification logic based on keywords
    const query = preprocessed.query || preprocessed;
    const queryLower = query.toLowerCase();
    
    let primaryIntent: IntentType;
    let confidence = 0.8;
    
    if (queryLower.includes('sort') || queryLower.includes('organize')) {
      if (queryLower.includes('date') || queryLower.includes('time')) {
        primaryIntent = IntentType.SORT_BY_TIME;
      } else if (queryLower.includes('people') || queryLower.includes('face')) {
        primaryIntent = IntentType.SORT_BY_PEOPLE;
      } else if (queryLower.includes('location') || queryLower.includes('place')) {
        primaryIntent = IntentType.SORT_BY_LOCATION;
      } else if (queryLower.includes('quality') || queryLower.includes('best')) {
        primaryIntent = IntentType.SORT_BY_QUALITY;
      } else if (queryLower.includes('similar') || queryLower.includes('like')) {
        primaryIntent = IntentType.SORT_BY_SIMILARITY;
      } else if (queryLower.includes('emotion') || queryLower.includes('mood')) {
        primaryIntent = IntentType.SORT_BY_EMOTION;
      } else {
        primaryIntent = IntentType.SORT_BY_CONTENT;
      }
    } else if (queryLower.includes('filter') || queryLower.includes('find')) {
      primaryIntent = IntentType.FILTER_BY_CRITERIA;
    } else if (queryLower.includes('group') || queryLower.includes('cluster')) {
      primaryIntent = IntentType.GROUP_BY_THEME;
    } else if (queryLower.includes('album')) {
      primaryIntent = IntentType.CREATE_ALBUMS;
    } else if (queryLower.includes('search')) {
      primaryIntent = IntentType.SEARCH_SIMILAR;
    } else if (queryLower.includes('analyze') || queryLower.includes('description')) {
      primaryIntent = IntentType.ANALYZE_CONTENT;
    } else {
      primaryIntent = IntentType.CUSTOM_SORTING;
      confidence = 0.5;
    }
    
    return {
      primary: primaryIntent,
      confidence,
      reasoning: `Classified based on keywords in query: "${query}"`
    };
  }

  /**
   * Enrich parameters with additional context
   */
  private enrichParametersWithContext(extracted: any): any {
    // Add default processing instructions based on extracted parameters
    return {
      ...extracted,
      processingInstructions: {
        useVision: extracted.requiresVision || false,
        maxVisionCalls: extracted.maxVisionCalls || 50,
        enableCaching: true,
        prioritizeSpeed: false,
        costOptimization: true,
        qualityThreshold: 0.7
      }
    };
  }

  /**
   * Generate execution steps from analyzed requirements
   */
  private generateExecutionSteps(analyzed: any): ExecutionPlan {
    const steps: ExecutionStep[] = [];
    
    // Add analysis step if needed
    if (analyzed.requiresAnalysis) {
      steps.push({
        name: 'analyze_content',
        type: 'analysis',
        agent: 'tool',
        chain: 'vision_analysis',
        parameters: analyzed.analysisParams || {},
        optional: false
      });
    }
    
    // Add sorting step
    steps.push({
      name: 'sort_images',
      type: 'sorting',
      agent: 'task',
      chain: 'image_sort',
      parameters: analyzed.sortParams || {},
      optional: false
    });
    
    // Add filtering step if needed
    if (analyzed.requiresFiltering) {
      steps.push({
        name: 'filter_results',
        type: 'filtering',
        agent: 'tool',
        chain: 'content_filter',
        parameters: analyzed.filterParams || {},
        optional: true
      });
    }
    
    return {
      steps,
      parallelizable: steps.length > 1,
      estimatedDuration: steps.length * 1000, // 1 second per step
      estimatedCost: steps.length * 0.01, // $0.01 per step
      dependencies: []
    };
  }

  /**
   * Health check for query processor
   */
  async healthCheck(): Promise<boolean> {
    try {
      const testQuery: QueryInput = {
        query: 'sort my photos by date',
        context: {
          userId: 'test',
          images: []
        }
      };
      
      const result = await this.processQuery(testQuery);
      return result.confidence > 0;
    } catch (error) {
      console.error('Query processor health check failed:', error);
      return false;
    }
  }
}

export interface UserFeedback {
  satisfied: boolean;
  rating: number;
  comments?: string;
  correctIntent?: IntentType;
  correctParameters?: QueryParameters;
}

export const QueryProcessorSchemas = {
  QueryInput: z.object({
    query: z.string(),
    context: z.object({
      userId: z.string(),
      images: z.array(z.any()),
      preferences: z.any().optional(),
      history: z.array(z.any()).optional()
    }),
    metadata: z.any().optional()
  }),

  ProcessedQuery: z.object({
    originalQuery: z.string(),
    intent: z.any(),
    parameters: z.any(),
    processingInstructions: z.any(),
    confidence: z.number().min(0).max(1),
    clarifications: z.array(z.string()).optional(),
    executionPlan: z.any(),
    metadata: z.any()
  })
};
