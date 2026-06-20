import os
import requests
import logging

logger = logging.getLogger(__name__)

def search_serper(query, num_results=3):
    """
    Tìm kiếm sử dụng Serper.dev API (trả về kết quả từ Google).
    Yêu cầu: SERPER_API_KEY trong file .env
    """
    api_key = os.getenv("SERPER_API_KEY")
    if not api_key:
        logger.warning("SERPER_API_KEY chưa được cấu hình, thử dùng Playwright...")
        return None  # sẽ fallback sang playwright

    url = "https://google.serper.dev/search"
    headers = {
        "X-API-KEY": api_key,
        "Content-Type": "application/json"
    }
    payload = {
        "q": query,
        "num": num_results
    }
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=15)
        if response.status_code == 200:
            data = response.json()
            results = data.get("organic", [])
            if not results:
                return "Không tìm thấy kết quả nào."
            formatted = []
            for i, item in enumerate(results, 1):
                title = item.get("title", "")
                snippet = item.get("snippet", "")
                link = item.get("link", "")
                formatted.append(f"{i}. {title}\n   {snippet}\n   {link}")
            return "\n\n".join(formatted)
        else:
            logger.error(f"Serper lỗi: {response.status_code} - {response.text}")
            return f"⚠️ Lỗi Serper API: {response.status_code}"
    except Exception as e:
        logger.error(f"Lỗi kết nối Serper: {e}")
        return f"⚠️ Lỗi kết nối Serper: {str(e)}"

def search_playwright_fallback(query, num_results=3):
    """
    Fallback: dùng Playwright để mô phỏng tìm kiếm Google (không cần key).
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return "⚠️ Playwright chưa được cài đặt. Cài đặt: pip install playwright && playwright install"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto(f"https://www.google.com/search?q={query}&num={num_results}")
            page.wait_for_selector("div#search", timeout=10000)
            html = page.content()
            browser.close()
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(html, 'html.parser')
            results = []
            for item in soup.select("div.g"):
                title_tag = item.select_one("h3")
                if not title_tag:
                    continue
                title = title_tag.get_text(strip=True)
                link_tag = item.select_one("a")
                link = link_tag.get("href") if link_tag else ""
                snippet_tag = item.select_one("div.VwiC3b")
                snippet = snippet_tag.get_text(strip=True) if snippet_tag else ""
                results.append(f"- {title}\n  {snippet}\n  {link}")
                if len(results) >= num_results:
                    break
            if not results:
                return "Không tìm thấy kết quả nào."
            return "\n\n".join(results)
    except Exception as e:
        logger.error(f"Lỗi Playwright: {e}")
        return f"⚠️ Lỗi Playwright: {str(e)}"

def google_search(query, num_results=3):
    """
    Hàm chính để tìm kiếm. Ưu tiên Serper, nếu không có key thì dùng Playwright.
    """
    result = search_serper(query, num_results)
    if result is not None:
        return result
    # Fallback sang Playwright
    return search_playwright_fallback(query, num_results)