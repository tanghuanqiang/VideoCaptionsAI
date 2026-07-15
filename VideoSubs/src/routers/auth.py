from fastapi import APIRouter

router = APIRouter()
# All auth routes (register, token, users/me) removed.
# Authentication is bypassed - all endpoints use default user.
