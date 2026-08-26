from google.cloud import firestore
from core.config import settings

db = firestore.AsyncClient(project=settings.PROJECT_ID)

def get_db():
    return db
