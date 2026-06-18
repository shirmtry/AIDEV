import json
from pathlib import Path
from typing import Dict, List, Optional, Union, Any
import re

class DiseaseMapper:
    """
    Maps disease labels (from classifier) to knowledge base entries.
    Supports lookup by label, name, keyword, or ID.
    """
    
    def __init__(self, json_path: Union[str, Path]):
        self.json_path = Path(json_path)
        if not self.json_path.exists():
            raise FileNotFoundError(f"Disease JSON not found: {self.json_path}")
        with open(self.json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        # Support both formats: list of diseases or object with "knowledge_base" key
        if isinstance(data, dict) and "knowledge_base" in data:
            self.diseases = data["knowledge_base"].get("diseases", [])
        elif isinstance(data, list):
            self.diseases = data
        else:
            self.diseases = []
        
        # Build indices
        self.id_index = {}
        self.name_index = {}
        self.label_index = {}
        self.keyword_index = {}
        
        for disease in self.diseases:
            if 'id' in disease:
                self.id_index[disease['id']] = disease
            if 'name' in disease:
                self.name_index[disease['name'].lower()] = disease
            if 'label' in disease:
                self.label_index[disease['label'].lower()] = disease
            if 'keywords' in disease and isinstance(disease['keywords'], list):
                for kw in disease['keywords']:
                    kw_lower = kw.lower()
                    self.keyword_index.setdefault(kw_lower, []).append(disease)
    
    def get_disease(self, identifier: Union[str, int]) -> Optional[Dict]:
        """Get disease by ID or name/label."""
        if isinstance(identifier, int):
            return self.id_index.get(identifier)
        identifier = str(identifier)
        if identifier.isdigit():
            return self.id_index.get(int(identifier))
        lower = identifier.lower()
        return self.name_index.get(lower) or self.label_index.get(lower)
    
    def get_disease_by_label(self, label: str) -> Optional[Dict]:
        lower = label.lower()
        return self.label_index.get(lower) or self.name_index.get(lower)
    
    def get_disease_by_keyword(self, keyword: str) -> Optional[Dict]:
        lower = keyword.lower()
        for kw, diseases in self.keyword_index.items():
            if lower in kw or kw in lower:
                return diseases[0]
        return None
    
    def search(self, query: str) -> List[Dict]:
        """Search diseases by name or keyword substring."""
        query_lower = query.lower()
        results = []
        for disease in self.diseases:
            name = disease.get('name', '').lower()
            if query_lower in name:
                results.append(disease)
                continue
            for kw in disease.get('keywords', []):
                if query_lower in kw.lower() or kw.lower() in query_lower:
                    results.append(disease)
                    break
        return results
    
    def get_recommendations(self, disease: Dict) -> List[str]:
        recs = disease.get('recommendations', []) or disease.get('treatment_urgent', []) or disease.get('prevention', [])
        return recs if isinstance(recs, list) else []