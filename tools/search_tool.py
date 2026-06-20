import os
import requests
import logging

logger = logging.getLogger(__name__)


def search_serper(query: str, num_results: int = 3) -> str | None:
    """
    Tìm kiếm sử dụng Serper.dev API (trả về kết quả từ Google).
    Yêu cầu: SERPER_API_KEY trong file .env

    Returns:
        str: Kết quả tìm kiếm được định dạng, hoặc None nếu không có API key (để fallback).
    """
    api_key = os.getenv("SERPER_API_KEY")
    if not api_key:
        logger.info("SERPER_API_KEY chưa được cấu hình, chuyển sang phương án dự phòng.")
        return None  # Signal để fallback

    url = "https://google.serper.dev/search"
    headers = {
        "X-API-KEY": api_key,
        "Content-Type": "application/json",
    }
    payload = {"q": query, "num": num_results, "gl": "vn", "hl": "vi"}  # ✅ Thêm locale cho kết quả tiếng Việt

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=15)

        if response.status_code == 200:
            data = response.json()
            results = data.get("organic", [])
            if not results:
                return "Không tìm thấy kết quả nào từ Serper."

            formatted = []
            for i, item in enumerate(results, 1):
                title = item.get("title", "Không có tiêu đề")
                snippet = item.get("snippet", "Không có mô tả")
                link = item.get("link", "")
                formatted.append(f"{i}. {title}\n   {snippet}\n   🔗 {link}")
            return "\n\n".join(formatted)

        elif response.status_code == 401:
            logger.error("SERPER_API_KEY không hợp lệ hoặc đã hết hạn.")
            return "⚠️ Serper API key không hợp lệ. Vui lòng kiểm tra cấu hình."
        elif response.status_code == 429:
            logger.warning("Serper API đã đạt giới hạn rate limit.")
            return None  # Fallback khi rate limit
        else:
            logger.error(f"Serper lỗi: {response.status_code} - {response.text[:200]}")
            return f"⚠️ Lỗi Serper API: {response.status_code}"

    except requests.exceptions.Timeout:
        logger.warning("Timeout khi gọi Serper API, thử phương án dự phòng.")
        return None
    except requests.exceptions.RequestException as e:
        logger.error(f"Lỗi kết nối Serper: {e}")
        return None  # Fallback thay vì trả lỗi để tiếp tục xử lý


def search_playwright_fallback(query: str, num_results: int = 3) -> str:
    """
    Fallback: dùng Playwright để lấy kết quả Google (không cần API key).
    Chỉ dùng khi Serper không khả dụng.
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        logger.warning("Playwright chưa được cài đặt.")
        return (
            "⚠️ Không thể tìm kiếm bổ sung: cần cài đặt Playwright. "
            "Chạy: pip install playwright && playwright install chromium"
        )

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                locale="vi-VN",
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            )
            page = context.new_page()

            # ✅ NÂNG CẤP: Dùng URL encode an toàn hơn
            import urllib.parse
            encoded_query = urllib.parse.quote_plus(query)
            page.goto(
                f"https://www.google.com/search?q={encoded_query}&num={num_results}&hl=vi",
                timeout=15000,
            )
            page.wait_for_selector("div#search", timeout=10000)
            html = page.content()
            browser.close()

        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "html.parser")
        results = []
        for item in soup.select("div.g"):
            title_tag = item.select_one("h3")
            if not title_tag:
                continue
            title = title_tag.get_text(strip=True)
            link_tag = item.select_one("a[href]")
            link = link_tag.get("href", "") if link_tag else ""
            snippet_tag = item.select_one("div.VwiC3b")
            snippet = snippet_tag.get_text(strip=True) if snippet_tag else "Không có mô tả"
            results.append(f"- {title}\n  {snippet}\n  🔗 {link}")
            if len(results) >= num_results:
                break

        if not results:
            return "Không tìm thấy kết quả nào từ Google."
        return "\n\n".join(results)

    except Exception as e:
        logger.error(f"Lỗi Playwright fallback: {e}", exc_info=True)
        return f"⚠️ Không thể tìm kiếm bổ sung qua trình duyệt: {str(e)}"


def google_search(query: str, num_results: int = 3) -> str:
    """
    Hàm chính để tìm kiếm thông tin bổ sung.
    Ưu tiên Serper.dev API; fallback sang Playwright nếu Serper không có key hoặc bị lỗi.

    Args:
        query: Câu truy vấn tìm kiếm.
        num_results: Số kết quả mong muốn (tối đa).

    Returns:
        str: Kết quả tìm kiếm được định dạng.
    """
    if not query or not query.strip():
        return "⚠️ Không có từ khóa tìm kiếm."

    logger.info(f"Tìm kiếm: '{query}' (num_results={num_results})")

    # Thử Serper trước
    result = search_serper(query, num_results)
    if result is not None:
        return result

    # Fallback sang Playwright
    logger.info("Serper không khả dụng, dùng Playwright fallback.")
    return search_playwright_fallback(query, num_results)