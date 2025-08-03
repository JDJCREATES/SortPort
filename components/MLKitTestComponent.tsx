/**
 * ML Kit Test Component
 * A simple React component to test ML Kit integration in the app
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { quickMLKitTest } from '../mlkit-app-test';

export function MLKitTestComponent() {
  const [testResults, setTestResults] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  // Capture console logs for display
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  const captureLog = (message: string, type: 'log' | 'error' | 'warn' = 'log') => {
    setLogs(prev => [...prev, `[${type.toUpperCase()}] ${message}`]);
    if (type === 'error') originalError(message);
    else if (type === 'warn') originalWarn(message);
    else originalLog(message);
  };

  const runQuickTest = async () => {
    setIsLoading(true);
    setLogs([]);
    setTestResults(null);

    // Override console methods to capture logs
    console.log = (message) => captureLog(String(message), 'log');
    console.error = (message) => captureLog(String(message), 'error');
    console.warn = (message) => captureLog(String(message), 'warn');

    try {
      captureLog('🚀 Starting Quick ML Kit Test...');
      const results = await quickMLKitTest();
      setTestResults(results);
      
      if (results.success) {
        captureLog('🎉 Quick test PASSED - ML Kit is working!', 'log');
      } else {
        captureLog('❌ Quick test FAILED - Check logs for details', 'error');
      }
    } catch (error) {
      captureLog(`❌ Test error: ${error}`, 'error');
      setTestResults({ success: false, error: String(error) });
    } finally {
      // Restore console methods
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
      setIsLoading(false);
    }
  };

  const runFullTest = async () => {
    setIsLoading(true);
    setLogs([]);
    setTestResults(null);

    // Override console methods to capture logs
    console.log = (message) => captureLog(String(message), 'log');
    console.error = (message) => captureLog(String(message), 'error');
    console.warn = (message) => captureLog(String(message), 'warn');

    try {
      captureLog('🚀 Starting Full ML Kit Test Suite...');
      const results = await runMLKitTestWithOnlineImages();
      setTestResults(results);
      
      if (results.overallSuccess) {
        captureLog('🎉 All tests PASSED - ML Kit is fully working!', 'log');
      } else {
        captureLog(`⚠️ ${results.passedTests}/${results.totalTests} tests passed`, 'warn');
      }
    } catch (error) {
      captureLog(`❌ Test suite error: ${error}`, 'error');
      setTestResults({ success: false, error: String(error) });
    } finally {
      // Restore console methods
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
      setIsLoading(false);
    }
  };

  const clearLogs = () => {
    setLogs([]);
    setTestResults(null);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ML Kit Integration Test</Text>
      <Text style={styles.subtitle}>
        Test if ML Kit is returning real data instead of mock data
      </Text>

      <View style={styles.buttonContainer}>
        <TouchableOpacity 
          style={[styles.button, styles.quickButton]} 
          onPress={runQuickTest}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>
            {isLoading ? '⏳ Testing...' : '⚡ Quick Test'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, styles.fullButton]} 
          onPress={runFullTest}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>
            {isLoading ? '⏳ Testing...' : '🧪 Full Test Suite'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, styles.clearButton]} 
          onPress={clearLogs}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>🗑️ Clear Logs</Text>
        </TouchableOpacity>
      </View>

      {testResults && (
        <View style={styles.resultsContainer}>
          <Text style={[styles.resultTitle, testResults.success ? styles.success : styles.failure]}>
            {testResults.success ? '✅ Test Passed' : '❌ Test Failed'}
          </Text>
          {testResults.totalTests && (
            <Text style={styles.resultText}>
              Results: {testResults.passedTests}/{testResults.totalTests} tests passed
            </Text>
          )}
        </View>
      )}

      <ScrollView style={styles.logContainer}>
        {logs.map((log, index) => (
          <Text 
            key={index} 
            style={[
              styles.logText,
              log.includes('[ERROR]') && styles.errorLog,
              log.includes('[WARN]') && styles.warnLog
            ]}
          >
            {log}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  button: {
    padding: 12,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  quickButton: {
    backgroundColor: '#4CAF50',
  },
  fullButton: {
    backgroundColor: '#2196F3',
  },
  clearButton: {
    backgroundColor: '#9E9E9E',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  resultsContainer: {
    padding: 12,
    backgroundColor: 'white',
    borderRadius: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  resultText: {
    fontSize: 14,
    color: '#666',
  },
  success: {
    color: '#4CAF50',
  },
  failure: {
    color: '#F44336',
  },
  logContainer: {
    flex: 1,
    backgroundColor: '#000',
    borderRadius: 8,
    padding: 12,
  },
  logText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  errorLog: {
    color: '#ff6b6b',
  },
  warnLog: {
    color: '#ffd93d',
  },
});

export default MLKitTestComponent;
