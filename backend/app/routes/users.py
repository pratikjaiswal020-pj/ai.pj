from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.models.models import User, APIUsage
from app.schemas.schemas import UserResponse
from app.config.database import SessionLocal
from app.middleware.auth import get_current_user

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current user info"""
    try:
        user = db.query(User).filter(User.id == current_user).first()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        return user
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/usage")
async def get_usage_stats(
    current_user: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get API usage stats for user"""
    try:
        usage = db.query(APIUsage).filter(
            APIUsage.user_id == current_user
        ).order_by(APIUsage.created_at.desc()).all()

        total_tokens = sum(u.tokens_used or 0 for u in usage)
        total_cost = sum(float(u.cost or 0) for u in usage)

        return {
            "total_requests": len(usage),
            "total_tokens": total_tokens,
            "total_cost": round(total_cost, 2),
            "usage_history": usage
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
