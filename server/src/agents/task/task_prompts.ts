/**
 * Task Agent Prompt Templates
 * 
 * LCEL prompt templates for task orchestration, workflow planning,
 * and dynamic context injection for multi-step tasks.
 */

import { PromptTemplate } from '@langchain/core/prompts';

export const TaskPrompts = {
  /**
   * Task Analysis and Planning
   */
  TASK_ANALYSIS: PromptTemplate.fromTemplate(`
You are a task orchestration specialist for an image sorting system. Analyze the user's task request and create an optimal execution plan.

Task Request:
- Type: {taskType}
- Description: {description}
- Parameters: {parameters}
- Priority: {priority}
- Constraints: {constraints}

Available Resources:
- Image Count: {imageCount}
- Available Tools: {availableTools}
- Available Agents: {availableAgents}

Please analyze this task and provide:
1. Task complexity assessment (low/medium/high)
2. Required agents and tools
3. Estimated execution time
4. Cost estimate
5. Risk factors
6. Recommended approach (sequential/parallel/hybrid)

Analysis:
`),

  /**
   * Workflow Step Planning
   */
  WORKFLOW_PLANNING: PromptTemplate.fromTemplate(`
Create a detailed workflow for the following task:

Task: {taskDescription}
Goal: {taskGoal}
Parameters: {parameters}
Constraints: {constraints}

Available Components:
- Vision Analysis Tools: {visionTools}
- Sorting Algorithms: {sortingTools}
- Filtering Tools: {filteringTools}
- Content Analysis Tools: {contentTools}

Create a workflow with these elements:
1. Step sequence (with dependencies)
2. Required tools for each step
3. Error handling strategy
4. Quality checkpoints
5. Optimization opportunities

Workflow Definition:
`),

  /**
   * Agent Coordination
   */
  AGENT_COORDINATION: PromptTemplate.fromTemplate(`
You need to coordinate multiple agents for a complex image sorting task.

Task Context:
- Primary Goal: {primaryGoal}
- Image Collection: {imageDescription}
- User Requirements: {userRequirements}
- Performance Requirements: {performanceRequirements}

Available Agents:
- Task Agent: Multi-step workflow orchestration
- Tool Agent: Single-action tool execution
- Query Agent: Natural language understanding

Current Status:
- Completed Steps: {completedSteps}
- Current Step: {currentStep}
- Remaining Steps: {remainingSteps}

Please provide coordination instructions:
1. Next agent to activate
2. Parameters to pass
3. Expected output format
4. Contingency plans
5. Quality validation criteria

Coordination Plan:
`),

  /**
   * Error Recovery and Retry
   */
  ERROR_RECOVERY: PromptTemplate.fromTemplate(`
A workflow step has failed and needs recovery strategy.

Failed Step:
- Step ID: {stepId}
- Tool Used: {toolUsed}
- Error Type: {errorType}
- Error Message: {errorMessage}
- Retry Attempt: {retryAttempt}

Context:
- Workflow Progress: {workflowProgress}
- Critical Path Impact: {criticalPathImpact}
- Available Alternatives: {alternatives}
- Time Constraints: {timeConstraints}

Determine recovery strategy:
1. Should retry with same parameters?
2. Should retry with modified parameters?
3. Should use alternative tool/approach?
4. Should skip step (if non-critical)?
5. Should abort workflow?

Provide specific recommendations with reasoning.

Recovery Strategy:
`),

  /**
   * Quality Assessment
   */
  QUALITY_ASSESSMENT: PromptTemplate.fromTemplate(`
Assess the quality of task execution results.

Task Results:
- Original Request: {originalRequest}
- Execution Steps: {executionSteps}
- Final Output: {finalOutput}
- Processing Time: {processingTime}
- Resources Used: {resourcesUsed}

Quality Criteria:
- Accuracy: Did it meet the user's intent?
- Completeness: Are all requirements satisfied?
- Efficiency: Was it executed optimally?
- User Experience: Is the result user-friendly?

Step-by-step Assessment:
{stepResults}

Provide quality scores (0-1) for:
1. Overall accuracy
2. Completeness
3. Efficiency
4. User experience
5. Technical quality

Include specific feedback and improvement suggestions.

Quality Assessment:
`),

  /**
   * Dynamic Context Injection
   */
  CONTEXT_ENRICHMENT: PromptTemplate.fromTemplate(`
Enrich the task context with additional information for better execution.

Base Context:
- User ID: {userId}
- Task Type: {taskType}
- Image Collection: {imageCollection}
- User Preferences: {userPreferences}

Current Knowledge:
- Previous Tasks: {previousTasks}
- User Patterns: {userPatterns}
- System State: {systemState}
- Resource Availability: {resourceAvailability}

Analyze and provide enriched context:
1. Inferred user intent beyond explicit request
2. Relevant patterns from user history
3. Optimal resource allocation suggestions
4. Proactive quality improvements
5. Personalization opportunities

Enhanced Context:
`),

  /**
   * Multi-Step Task Orchestration
   */
  ORCHESTRATION: PromptTemplate.fromTemplate(`
Orchestrate a complex multi-step image sorting workflow.

Workflow Definition:
{workflowDefinition}

Current State:
- Execution Progress: {executionProgress}
- Completed Steps: {completedSteps}
- Active Steps: {activeSteps}
- Pending Steps: {pendingSteps}

Resource Status:
- Agent Availability: {agentAvailability}
- Tool Status: {toolStatus}
- System Load: {systemLoad}
- Cost Budget: {costBudget}

Make orchestration decisions:
1. Next steps to execute (consider parallelization)
2. Resource allocation
3. Priority adjustments
4. Risk mitigation actions
5. Progress checkpoints

Execution Plan:
`),

  /**
   * User Communication
   */
  USER_COMMUNICATION: PromptTemplate.fromTemplate(`
Generate user-friendly communication about task progress.

Task Status:
- Task: {taskDescription}
- Progress: {progressPercentage}%
- Current Activity: {currentActivity}
- Time Elapsed: {timeElapsed}
- Estimated Remaining: {estimatedRemaining}

Recent Accomplishments:
{recentAccomplishments}

Current Challenges:
{currentChallenges}

Create a user-friendly status update that:
1. Clearly explains current progress
2. Highlights key accomplishments
3. Addresses any delays or issues
4. Sets appropriate expectations
5. Maintains user confidence

Status Message:
`),

  /**
   * Performance Optimization
   */
  OPTIMIZATION: PromptTemplate.fromTemplate(`
Optimize task execution performance based on current metrics.

Performance Data:
- Average Step Time: {avgStepTime}
- Resource Utilization: {resourceUtilization}
- Queue Depth: {queueDepth}
- Error Rate: {errorRate}
- Cost per Task: {costPerTask}

Bottlenecks Identified:
{bottlenecks}

Optimization Opportunities:
{optimizationOpportunities}

Recommend optimizations:
1. Workflow structure improvements
2. Resource allocation adjustments
3. Caching strategies
4. Parallel execution opportunities
5. Tool selection optimizations

Optimization Plan:
`)
};

/**
 * Dynamic prompt builder for context-aware task orchestration
 */
export class TaskPromptBuilder {
  /**
   * Build context-aware prompt for task planning
   */
  static buildPlanningPrompt(context: {
    task: any;
    resources: any;
    constraints: any;
    history?: any;
  }): PromptTemplate {
    const template = `
Based on the task context and available resources, create an optimal execution plan.

Task Analysis:
- Type: {taskType}
- Complexity: {complexity}
- Requirements: {requirements}
- Constraints: {constraints}

Resource Assessment:
- Available Tools: {availableTools}
- System Capacity: {systemCapacity}
- Budget Constraints: {budgetConstraints}

${context.history ? `
Historical Context:
- Similar Tasks: {similarTasks}
- Success Patterns: {successPatterns}
- Common Issues: {commonIssues}
` : ''}

Create a detailed execution plan with:
1. Step-by-step workflow
2. Resource allocation
3. Risk mitigation
4. Quality assurance
5. Success metrics

Execution Plan:
`;

    return PromptTemplate.fromTemplate(template);
  }

  /**
   * Build adaptive prompt for error handling
   */
  static buildErrorHandlingPrompt(errorContext: {
    errorType: string;
    severity: string;
    impact: string;
    recovery: any;
  }): PromptTemplate {
    const template = `
An error has occurred during task execution. Determine the best recovery strategy.

Error Details:
- Type: {errorType}
- Severity: {severity}
- Impact: {impact}
- Context: {errorContext}

Recovery Options:
- Retry Strategies: {retryStrategies}
- Alternative Approaches: {alternatives}
- Fallback Mechanisms: {fallbacks}

Based on the error analysis, provide:
1. Root cause assessment
2. Impact evaluation
3. Recovery recommendations
4. Prevention measures
5. Escalation criteria

Recovery Strategy:
`;

    return PromptTemplate.fromTemplate(template);
  }

  /**
   * Build progress communication prompt
   */
  static buildProgressPrompt(progressContext: {
    stage: string;
    completion: number;
    user: any;
  }): PromptTemplate {
    const baseTemplate = `
Update the user on task progress in a clear and encouraging way.

Progress Information:
- Current Stage: {currentStage}
- Completion: {completionPercentage}%
- Achievements: {achievements}
- Next Steps: {nextSteps}

Communication Style: {communicationStyle}
User Preferences: {userPreferences}

Create a progress update that:
1. Clearly explains current status
2. Highlights accomplishments
3. Sets realistic expectations
4. Maintains engagement
5. Addresses any concerns

Progress Update:
`;

    return PromptTemplate.fromTemplate(baseTemplate);
  }
}

/**
 * Prompt template configurations for different task types
 */
export const TaskTypePrompts = {
  IMAGE_SORTING: {
    planning: TaskPrompts.TASK_ANALYSIS,
    execution: TaskPrompts.ORCHESTRATION,
    quality: TaskPrompts.QUALITY_ASSESSMENT
  },
  
  CONTENT_ANALYSIS: {
    planning: TaskPrompts.WORKFLOW_PLANNING,
    execution: TaskPrompts.AGENT_COORDINATION,
    quality: TaskPrompts.QUALITY_ASSESSMENT
  },
  
  ALBUM_CREATION: {
    planning: TaskPrompts.CONTEXT_ENRICHMENT,
    execution: TaskPrompts.ORCHESTRATION,
    quality: TaskPrompts.QUALITY_ASSESSMENT
  },
  
  BULK_PROCESSING: {
    planning: TaskPrompts.OPTIMIZATION,
    execution: TaskPrompts.ORCHESTRATION,
    quality: TaskPrompts.QUALITY_ASSESSMENT
  }
};
