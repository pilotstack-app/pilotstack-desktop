/**
 * IPC Data Sanitizer
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Known Issues §7 - IPC Sanitization
 * 
 * Sanitizes data for IPC communication (simplified version).
 * Maps to: main.js sanitizeForIPC function
 */

/**
 * Sanitize data for IPC
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Known Issues §7
 * 
 * Handles circular references, non-serializable types, and ensures data
 * can be safely sent over IPC channels.
 */
export function sanitizeForIPC(obj: any): any {
  // Track seen objects to handle circular references
  const seen = new WeakSet();
  
  try {
    const jsonSafe = JSON.stringify(obj, (_key, value) => {
      // Handle null/undefined early
      if (value === null) {
        return null;
      }
      if (value === undefined) {
        return null;
      }
      
      // Handle BigInt
      if (typeof value === "bigint") {
        return Number(value);
      }
      
      // Handle functions - skip them
      if (typeof value === "function") {
        return undefined;
      }
      
      // Handle symbols - skip them
      if (typeof value === "symbol") {
        return undefined;
      }
      
      // Handle NaN and Infinity
      if (typeof value === "number" && !Number.isFinite(value)) {
        return null;
      }
      
      // Handle objects (including arrays)
      if (typeof value === "object" && value !== null) {
        // Check for circular references
        if (seen.has(value)) {
          return "[Circular]";
        }
        seen.add(value);
        
        // Handle Buffer
        if (Buffer.isBuffer(value)) {
          return { _type: "Buffer", length: value.length };
        }
        
        // Handle Error objects
        if (value instanceof Error) {
          return {
            _type: "Error",
            name: value.name,
            message: value.message,
          };
        }
        
        // Handle Map
        if (value instanceof Map) {
          return { _type: "Map", size: value.size };
        }
        
        // Handle Set
        if (value instanceof Set) {
          return { _type: "Set", size: value.size };
        }
        
        // Handle RegExp
        if (value instanceof RegExp) {
          return value.toString();
        }
        
        // Handle Date
        if (value instanceof Date) {
          return value.getTime();
        }
        
        // Handle native objects that might have crept in (like process, stream, etc.)
        const constructorName = value.constructor?.name;
        if (constructorName && !["Object", "Array"].includes(constructorName)) {
          // This is a custom class instance - only keep primitive properties
          const safeObj: Record<string, any> = {};
          for (const [k, v] of Object.entries(value)) {
            if (typeof v !== "object" && typeof v !== "function") {
              safeObj[k] = v;
            }
          }
          return safeObj;
        }
      }
      
      return value;
    });
    
    // If JSON serialization failed, return a safe fallback
    if (jsonSafe === undefined) {
      console.warn("Failed to serialize object for IPC, returning empty object");
      return {};
    }
    
    // Parse back to object - this ensures the result is definitely serializable
    return JSON.parse(jsonSafe);
  } catch (e: any) {
    console.warn("sanitizeForIPC failed:", e.message);
    // Last resort: return a minimal safe object
    if (typeof obj === "object" && obj !== null) {
      try {
        // Try to extract just the top-level primitive values
        const fallback: Record<string, any> = {};
        for (const [key, value] of Object.entries(obj)) {
          if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
            fallback[key] = value;
          }
        }
        return fallback;
      } catch (_e2) {
        return {};
      }
    }
    return {};
  }
}

