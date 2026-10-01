import { runCalculation } from "./numericalCalculations.js";
import { explainNumericalCalculation } from "./numericalExplanation.js";

self.addEventListener("message", ({ data }) => {
  try {
    const result = runCalculation(data.type, data.input);
    result.steps = explainNumericalCalculation(result);
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
});
