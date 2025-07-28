/**
 * Tool Agent Prompt Templates
 * 
 * LCEL tool selection and parameter extraction prompts.
 */

import { PromptTemplate } from '@langchain/core/prompts';

export const ToolPrompts = {
  TOOL_SELECTION: PromptTemplate.fromTemplate(`
Select the best tool for the given task.

Task: {task}
Available Tools: {availableTools}
Parameters: {parameters}

Tool Selection:
`),

  PARAMETER_EXTRACTION: PromptTemplate.fromTemplate(`
Extract parameters for tool execution.

Tool: {toolName}
Input: {input}
Context: {context}

Extracted Parameters:
`)
};
