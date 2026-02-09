package logger

import (
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

var log *zap.Logger

func Init(environment string) error {
	var config zap.Config

	if environment == "production" {
		config = zap.NewProductionConfig()
		config.EncoderConfig.TimeKey = "timestamp"
		config.EncoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder
	} else {
		config = zap.NewDevelopmentConfig()
		config.EncoderConfig.EncodeLevel = zapcore.CapitalColorLevelEncoder
	}

	var err error
	log, err = config.Build()
	if err != nil {
		return err
	}

	return nil
}

func Get() *zap.Logger {
	if log == nil {
		log, _ = zap.NewDevelopment()
	}
	return log
}

func Sync() error {
	if log != nil {
		return log.Sync()
	}
	return nil
}

func Info(msg string, fields ...zap.Field) {
	Get().Info(msg, fields...)
}

func Error(msg string, fields ...zap.Field) {
	Get().Error(msg, fields...)
}

func Fatal(msg string, fields ...zap.Field) {
	Get().Fatal(msg, fields...)
}

func Warn(msg string, fields ...zap.Field) {
	Get().Warn(msg, fields...)
}

func Debug(msg string, fields ...zap.Field) {
	Get().Debug(msg, fields...)
}

// Error returns a zap.Field for error logging
func Err(err error) zap.Field {
	return zap.Error(err)
}

// String returns a zap.Field for string values
func String(key, val string) zap.Field {
	return zap.String(key, val)
}

// Int returns a zap.Field for int values
func Int(key string, val int) zap.Field {
	return zap.Int(key, val)
}
