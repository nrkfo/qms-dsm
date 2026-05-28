import sys
import logging

class RussianFormatter(logging.Formatter):
    LEVEL_TRANSLATION = {
        'DEBUG': 'ОТЛАДКА',
        'INFO': 'ИНФО',
        'WARNING': 'ВНИМАНИЕ',
        'ERROR': 'ОШИБКА',
        'CRITICAL': 'КРИТИЧЕСКИЙ'
    }

    def format(self, record):
        orig_levelname = record.levelname
        record.levelname = self.LEVEL_TRANSLATION.get(orig_levelname, orig_levelname)
        record.asctime = self.formatTime(record, "%Y-%m-%d %H:%M:%S")
        formatted = super().format(record)
        record.levelname = orig_levelname
        return formatted

def setup_logger(module_name: str) -> logging.Logger:
    logger = logging.getLogger(module_name)
    logger.setLevel(logging.DEBUG)
    
    if logger.handlers:
        return logger

    log_format = "[%(name)s] [%(asctime)s] [%(levelname)s] -> %(message)s (%(filename)s:%(lineno)d)"
    formatter = RussianFormatter(log_format)

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    return logger

logger = setup_logger("Система")

def global_exception_handler(exc_type, exc_value, exc_traceback):
    if issubclass(exc_type, KeyboardInterrupt):
        sys.__excepthook__(exc_type, exc_value, exc_traceback)
        return

    logger.critical(
        f"КРИТИЧЕСКОЕ НЕОБРАБОТАННОЕ ИСКЛЮЧЕНИЕ: {exc_value}",
        exc_info=(exc_type, exc_value, exc_traceback)
    )

sys.excepthook = global_exception_handler
