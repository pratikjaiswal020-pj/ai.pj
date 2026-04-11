from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy.orm import Session
import bcrypt
from datetime import timedelta

from app.models.models import User
from app.schemas.schemas import UserCreate, UserResponse, LoginRequest, TokenResponse
from app.config.database import SessionLocal
from app.middleware.auth import create_access_token
import os

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def hash_password(password: str) -> str:
    """Hash password using bcrypt"""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hash: str) -> bool:
    """Verify password against hash"""
    return bcrypt.checkpw(password.encode(), hash.encode())


@router.post("/register", response_model=TokenResponse)
async def register(user: UserCreate, db: Session = Depends(get_db)):
    """Register new user"""
    try:
        # Check if user exists
        existing_user = db.query(User).filter(User.email == user.email).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User already exists"
            )

        # Hash password
        hashed_password = hash_password(user.password)

        # Create user
        db_user = User(
            email=user.email,
            password_hash=hashed_password,
            username=user.username or user.email.split("@")[0]
        )

        db.add(db_user)
        db.commit()
        db.refresh(db_user)

        # Create token
        access_token = create_access_token(data={"sub": str(db_user.id)})

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": db_user.id,
                "email": db_user.email,
                "username": db_user.username,
                "created_at": db_user.created_at
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/login", response_model=TokenResponse)
async def login(credentials: LoginRequest, db: Session = Depends(get_db)):
    """Login user"""
    try:
        # Find user
        db_user = db.query(User).filter(User.email == credentials.email).first()

        if not db_user or not verify_password(credentials.password, db_user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials"
            )

        # Create token
        access_token = create_access_token(data={"sub": str(db_user.id)})

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": db_user.id,
                "email": db_user.email,
                "username": db_user.username,
                "created_at": db_user.created_at
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
@router.get("/guest")
async def guest_login(db: Session = Depends(get_db)):
    """Login as a guest user"""
    try:
        # Check if guest user exists
        guest_email = "guest@intellichat.local"
        db_user = db.query(User).filter(User.email == guest_email).first()

        if not db_user:
            try:
                # Create guest user if not found
                db_user = User(
                    email=guest_email,
                    password_hash=hash_password("guest_pass_123"),
                    username="Guest User"
                )
                db.add(db_user)
                db.commit()
                db.refresh(db_user)
            except Exception as e:
                db.rollback()
                # If race condition, try fetching again
                db_user = db.query(User).filter(User.email == guest_email).first()
                if not db_user:
                    raise e

        # Create token
        access_token = create_access_token(data={"sub": str(db_user.id)})

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": db_user.id,
                "email": db_user.email,
                "username": db_user.username,
                "created_at": db_user.created_at
            }
        }
    except Exception as e:
        print(f"Error during guest login: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Guest login failed: {str(e)}"
        )
