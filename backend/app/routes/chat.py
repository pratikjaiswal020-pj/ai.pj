from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import httpx
import os
import json
from datetime import datetime

from app.models.models import ChatSession, ChatMessage, User, APIUsage
from app.schemas.schemas import (
    SessionResponse, SessionDetailResponse, MessageCreate,
    MessageResponse, SessionCreate
)
from app.config.database import SessionLocal
from app.middleware.auth import get_current_user

router = APIRouter()
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")



def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/sessions")
async def get_sessions(
    current_user: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all chat sessions for user"""
    try:
        sessions = db.query(ChatSession).filter(
            ChatSession.user_id == current_user
        ).order_by(ChatSession.created_at.desc()).all()

        return sessions
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/sessions", response_model=SessionResponse)
async def create_session(
    session: SessionCreate,
    current_user: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create new chat session"""
    try:
        db_session = ChatSession(
            user_id=current_user,
            title=session.title
        )

        db.add(db_session)
        db.commit()
        db.refresh(db_session)

        return db_session
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: int,
    current_user: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a chat session"""
    try:
        session = db.query(ChatSession).filter(
            ChatSession.id == session_id,
            ChatSession.user_id == current_user
        ).first()

        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )

        db.delete(session)
        db.commit()

        return {"message": "Session deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.delete("/sessions")
async def delete_all_sessions(
    current_user: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete all chat sessions for user"""
    try:
        db.query(ChatSession).filter(
            ChatSession.user_id == current_user
        ).delete()
        db.commit()

        return {"message": "All sessions deleted"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/sessions/{session_id}/messages", response_model=list[MessageResponse])
async def get_messages(
    session_id: int,
    current_user: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get messages for a session"""
    try:
        session = db.query(ChatSession).filter(
            ChatSession.id == session_id,
            ChatSession.user_id == current_user
        ).first()

        if not session:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unauthorized"
            )

        messages = db.query(ChatMessage).filter(
            ChatMessage.session_id == session_id
        ).order_by(ChatMessage.created_at.asc()).all()

        return messages
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/sessions/{session_id}/messages")
async def send_message(
    session_id: int,
    message_data: MessageCreate,
    current_user: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Send message and get AI response (non-streaming)"""
    try:
        session = db.query(ChatSession).filter(
            ChatSession.id == session_id,
            ChatSession.user_id == current_user
        ).first()

        if not session:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unauthorized"
            )

        # Save user message
        user_message = ChatMessage(
            session_id=session_id,
            role="user",
            content=message_data.message
        )
        db.add(user_message)
        db.commit()

        # Get chat history
        # Get recent chat history (limit to last 15 messages for performance)
        messages = db.query(ChatMessage).filter(
            ChatMessage.session_id == session_id
        ).order_by(ChatMessage.created_at.desc()).limit(15).all()
        messages.reverse() # Restore chronological order

        # Prepare messages for API
        api_messages = [
            {"role": msg.role, "content": msg.content}
            for msg in messages
        ]

        # Call AI API based on model selection
        model = message_data.model.lower()
        if model in ("gemini", "gemini-2.0-flash", "gemini-2.5-flash"):
            ai_response = await call_gemini_api(api_messages)
        elif model == "claude":
            ai_response = await call_claude_api(api_messages)
        elif model in ("openai", "gpt"):
            ai_response = await call_openai_api(api_messages)
        elif "gemma" in model:
            ai_response = await call_ollama_api(api_messages, model="gemma4")
        else:
            ai_response = await call_gemini_api(api_messages)


        # Save AI response
        ai_message = ChatMessage(
            session_id=session_id,
            role="assistant",
            content=ai_response
        )
        db.add(ai_message)

        # Update session title if first message
        if len(messages) == 1:
            session.title = message_data.message[:50]

        db.commit()

        # Log usage
        await log_api_usage(db, current_user, model)

        return {
            "message": message_data.message,
            "response": ai_response,
            "model": model
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/sessions/{session_id}/messages/stream")
async def send_message_stream(
    session_id: int,
    message_data: MessageCreate,
    current_user: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Send message and get AI response (streaming)"""
    try:
        session = db.query(ChatSession).filter(
            ChatSession.id == session_id,
            ChatSession.user_id == current_user
        ).first()

        if not session:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unauthorized"
            )

        # Save user message
        user_message = ChatMessage(
            session_id=session_id,
            role="user",
            content=message_data.message
        )
        db.add(user_message)
        db.commit()

        # Get chat history
        # Get recent chat history (limit to last 15 messages for performance)
        messages = db.query(ChatMessage).filter(
            ChatMessage.session_id == session_id
        ).order_by(ChatMessage.created_at.desc()).limit(15).all()
        messages.reverse() # Restore chronological order

        api_messages = [
            {"role": msg.role, "content": msg.content}
            for msg in messages
        ]

        # Update title on first message
        if len(messages) == 1:
            session.title = message_data.message[:50]
            db.commit()

        model = message_data.model.lower()

        async def generate():
            full_text = ""
            try:
                if "gemma" in model:
                    gen = stream_ollama_api(api_messages, model="gemma4")
                else:
                    gen = stream_gemini_api(api_messages)

                async for chunk in gen:
                    full_text += chunk
                    yield chunk

                # Save complete AI response after streaming
                ai_message = ChatMessage(
                    session_id=session_id,
                    role="assistant",
                    content=full_text
                )
                db.add(ai_message)
                db.commit()
                await log_api_usage(db, current_user, model)
            except Exception as e:
                yield f"\n\nERROR: {str(e)}"

        return StreamingResponse(generate(), media_type="text/plain")
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


# ──────────────────────────────────────────
# AI API INTEGRATIONS
# ──────────────────────────────────────────

SYSTEM_PROMPT = """You are IntelliChat, an elite-level AI assistant powered by advanced neural reasoning. You excel at complex analysis, coding, creative writing, and providing objective, balanced insights.

## CORE IDENTITY
- **Advanced Intelligence**: You handle tasks with depth, nuance, and precision.
- **Thoughtful Reasoning**: Always consider multiple angles and potential implications.
- **Sophisticated Tone**: Your responses are articulate, professional, and clear.

## OPERATIONAL GUIDELINES
- Provide multi-faceted assessments for all queries.
- Never use generic fillers or repetitive introductory greetings.
- If providing code, ensure it is high-quality, documented, and uses modern standards.

## FINAL INSTRUCTION
- Your goal is to be the most helpful and insightful AI companion possible."""


# ──────────────────────────────────────────

async def call_ollama_api(messages: list, model: str = "gemma") -> str:
    """Call Local Ollama API (e.g. for Gemma)"""
    try:
        ollama_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        for msg in messages:
            ollama_messages.append({"role": msg["role"], "content": msg["content"]})

        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json={
                    "model": model,
                    "messages": ollama_messages,
                    "stream": False,
                    "options": {
                        "num_ctx": 4096,
                        "temperature": 0.7,
                        "top_p": 0.9
                    }
                }
            )

            if response.status_code != 200:
                raise Exception(f"Ollama API error: {response.text}")

            data = response.json()
            return data["message"]["content"]
    except Exception as e:
        raise Exception(f"Ollama ({model}) call failed: {str(e)}. Is Ollama running?")


async def stream_ollama_api(messages: list, model: str = "gemma"):
    """Stream from Local Ollama API"""
    try:
        ollama_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        for msg in messages:
            ollama_messages.append({"role": msg["role"], "content": msg["content"]})

        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                f"{OLLAMA_BASE_URL}/api/chat",
                json={
                    "model": model,
                    "messages": ollama_messages,
                    "stream": True,
                    "options": {
                        "num_ctx": 4096,
                        "temperature": 0.7
                    }
                }
            ) as response:
                if response.status_code != 200:
                    error_text = await response.aread()
                    raise Exception(f"Ollama streaming error ({response.status_code}): {error_text.decode()}")

                async for line in response.aiter_lines():
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                        if "message" in data and "content" in data["message"]:
                            yield data["message"]["content"]
                        if data.get("done"):
                            break
                    except json.JSONDecodeError:
                        continue
    except Exception as e:
        yield f"\n\nERROR: {str(e)}. Is Ollama running?"


async def call_gemini_api(messages: list) -> str:

    """Call Google Gemini API"""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise Exception("GEMINI_API_KEY not set in environment")

    # Convert messages to Gemini format
    gemini_contents = []
    for msg in messages:
        role = "model" if msg["role"] == "assistant" else "user"
        gemini_contents.append({
            "role": role,
            "parts": [{"text": msg["content"]}]
        })

    models_to_try = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.0-flash-lite"]

    for model_name in models_to_try:
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}",
                    json={
                        "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
                        "contents": gemini_contents
                    }
                )

                if response.status_code == 200:
                    data = response.json()
                    text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                    if text:
                        return text
                else:
                    print(f"Gemini model {model_name} failed: {response.status_code}")
                    continue
        except Exception as e:
            print(f"Gemini model {model_name} error: {e}")
            continue

    raise Exception("All Gemini models failed. Check your API key.")


async def stream_gemini_api(messages: list):
    """Stream from Google Gemini API"""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise Exception("GEMINI_API_KEY not set in environment")

    gemini_contents = []
    for msg in messages:
        role = "model" if msg["role"] == "assistant" else "user"
        gemini_contents.append({
            "role": role,
            "parts": [{"text": msg["content"]}]
        })

    model_name = "gemini-2.0-flash"

    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream(
            "POST",
            f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:streamGenerateContent?key={api_key}",
            json={
                "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
                "contents": gemini_contents
            }
        ) as response:
            if response.status_code != 200:
                error_text = await response.aread()
                raise Exception(f"Gemini streaming error ({response.status_code}): {error_text.decode()}")

            buffer = ""
            async for chunk in response.aiter_text():
                buffer += chunk

                # Parse JSON array chunks from Gemini stream
                buffer = buffer.lstrip("[,\n ")
                while True:
                    buffer = buffer.strip()
                    if not buffer or buffer == "]":
                        break

                    if buffer.startswith(","):
                        buffer = buffer[1:].strip()

                    brace_count = 0
                    end_idx = -1
                    for i, c in enumerate(buffer):
                        if c == "{":
                            brace_count += 1
                        elif c == "}":
                            brace_count -= 1
                            if brace_count == 0:
                                end_idx = i + 1
                                break

                    if end_idx == -1:
                        break

                    segment = buffer[:end_idx]
                    buffer = buffer[end_idx:]

                    try:
                        data = json.loads(segment)
                        text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                        if text:
                            yield text
                    except json.JSONDecodeError:
                        pass


async def call_claude_api(messages: list) -> str:
    """Call Claude API"""
    api_key = os.getenv("CLAUDE_API_KEY")
    if not api_key:
        raise Exception("CLAUDE_API_KEY not set in environment")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json"
                },
                json={
                    "model": "claude-3-5-sonnet-20241022",
                    "max_tokens": 4096,
                    "system": SYSTEM_PROMPT,
                    "messages": messages
                }
            )

            if response.status_code != 200:
                raise Exception(f"Claude API error: {response.text}")

            data = response.json()
            return data["content"][0]["text"]
    except Exception as e:
        raise Exception(f"Claude API call failed: {str(e)}")


async def call_openai_api(messages: list) -> str:
    """Call OpenAI API"""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise Exception("OPENAI_API_KEY not set in environment")

    try:
        openai_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        for msg in messages:
            role = "assistant" if msg["role"] == "assistant" else "user"
            openai_messages.append({"role": role, "content": msg["content"]})

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "content-type": "application/json"
                },
                json={
                    "model": "gpt-4",
                    "messages": openai_messages,
                    "max_tokens": 4096
                }
            )

            if response.status_code != 200:
                raise Exception(f"OpenAI API error: {response.text}")

            data = response.json()
            return data["choices"][0]["message"]["content"]
    except Exception as e:
        raise Exception(f"OpenAI API call failed: {str(e)}")


async def log_api_usage(db: Session, user_id: int, model: str):
    """Log API usage"""
    try:
        estimated_tokens = 500
        cost_map = {"gemini": 0.0001, "claude": 0.003, "openai": 0.005, "gemma": 0.0}
        cost_per_token = cost_map.get(model, 0.001) / 1000
        cost = estimated_tokens * cost_per_token

        usage = APIUsage(
            user_id=user_id,
            model_used=model,
            tokens_used=estimated_tokens,
            cost=cost
        )
        db.add(usage)
        db.commit()
    except Exception as e:
        print(f"Error logging usage: {e}")
