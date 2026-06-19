import os
from typing import Dict, Any, List, Optional
from crewai import Agent, Task, Crew, Process
from langchain_groq import ChatGroq
import json

class CrewAIManager:
    """
    Manages a crew of AI agents using CrewAI and Groq.
    """
    
    def __init__(self, groq_api_key: Optional[str] = None, model: str = "llama3-70b-8192"):
        self.api_key = groq_api_key or os.environ.get("GROQ_API_KEY")
        self.model = model
        self.llm = None
        if self.api_key:
            self.llm = ChatGroq(temperature=0.2, groq_api_key=self.api_key, model_name=self.model)
    
    def run_analysis(
        self,
        disease_info: Dict,
        prediction: Any,
        weather: Dict,
        risk_result: Any,
        farmer_question: str = ""
    ) -> str:
        """
        Run the crew to produce a comprehensive markdown report.
        """
        if self.llm is None:
            return self._fallback_report(disease_info, weather, risk_result, farmer_question)
        
        # Define agents
        disease_specialist = Agent(
            role="Disease Specialist",
            goal="Provide detailed disease explanation, symptoms, and severity.",
            backstory="You are an expert plant pathologist with deep knowledge of coffee diseases.",
            llm=self.llm,
            verbose=True,
            allow_delegation=False
        )
        
        agri_advisor = Agent(
            role="Agricultural Advisor",
            goal="Suggest immediate actions, preventive measures, and organic treatments.",
            backstory="You are a senior agronomist with field experience in the Central Highlands.",
            llm=self.llm,
            verbose=True,
            allow_delegation=False
        )
        
        economic_analyst = Agent(
            role="Economic Analyst",
            goal="Estimate yield impact, economic loss, and recovery strategies.",
            backstory="You are an agricultural economist specializing in coffee crop economics.",
            llm=self.llm,
            verbose=True,
            allow_delegation=False
        )
        
        # Prepare context
        context = {
            "disease_name": disease_info.get("name", "Unknown"),
            "disease_description": disease_info.get("description", ""),
            "symptoms": ", ".join(disease_info.get("symptoms", [])),
            "severity": disease_info.get("severity", "Unknown"),
            "confidence": f"{getattr(prediction, 'confidence', 0.0):.2f}",
            "weather": json.dumps(weather, indent=2, ensure_ascii=False),
            "risk_score": f"{getattr(risk_result, 'score', 0.0):.1f}",
            "risk_level": getattr(risk_result, 'level', 'UNKNOWN'),
            "risk_reasoning": getattr(risk_result, 'reasoning', ''),
            "farmer_question": farmer_question
        }
        
        # Tasks
        task_disease = Task(
            description=f"""
            Analyze this disease: {context['disease_name']}.
            Description: {context['disease_description']}
            Symptoms: {context['symptoms']}
            Severity: {context['severity']}
            Model Confidence: {context['confidence']}
            Provide a structured markdown section with Overview, Symptoms, Severity.
            """,
            agent=disease_specialist,
            expected_output="Markdown report on disease details."
        )
        
        task_agri = Task(
            description=f"""
            Given the disease and weather, provide actionable agricultural advice.
            Disease: {context['disease_name']}
            Weather: {context['weather']}
            Risk Level: {context['risk_level']}
            Risk Reasoning: {context['risk_reasoning']}
            Farmer Question: {context['farmer_question']}
            Include immediate actions, preventive measures, organic treatments.
            Format as markdown with headings.
            """,
            agent=agri_advisor,
            expected_output="Markdown report with agricultural recommendations."
        )
        
        task_economic = Task(
            description=f"""
            Estimate economic impact.
            Disease: {context['disease_name']}
            Severity: {context['severity']}
            Risk Score: {context['risk_score']}
            Provide estimated yield loss %, economic loss per hectare, recovery strategies.
            Format as markdown.
            """,
            agent=economic_analyst,
            expected_output="Markdown report with economic analysis."
        )
        
        crew = Crew(
            agents=[disease_specialist, agri_advisor, economic_analyst],
            tasks=[task_disease, task_agri, task_economic],
            process=Process.sequential,
            verbose=True
        )
        
        result = crew.kickoff()
        return result
    
    def _fallback_report(self, disease_info, weather, risk_result, farmer_question) -> str:
        return f"""
# Disease Analysis Report (Fallback - No Groq API Key)

## Disease Overview
- **Name**: {disease_info.get('name', 'Unknown')}
- **Description**: {disease_info.get('description', 'N/A')}
- **Symptoms**: {', '.join(disease_info.get('symptoms', []))}
- **Severity**: {disease_info.get('severity', 'Unknown')}

## Risk Assessment
- **Risk Score**: {getattr(risk_result, 'score', 0.0):.1f}
- **Risk Level**: {getattr(risk_result, 'level', 'UNKNOWN')}
- **Reasoning**: {getattr(risk_result, 'reasoning', '')}

## Weather Conditions
- Temperature: {weather.get('temperature')}°C
- Humidity: {weather.get('humidity')}%
- Rainfall: {weather.get('rainfall_1h')} mm

## Recommendations
Please set your Groq API key to receive detailed, AI-generated advice tailored to your farm.

**Farmer's Question**: {farmer_question}
"""